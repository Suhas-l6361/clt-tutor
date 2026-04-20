import { pool } from './db.js';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';
import crypto from 'crypto';
import { keysFromImageField, deleteS3Objects } from './s3-delete-helper.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const JWT_SECRET = process.env.JWT_SECRET;
const STUDENT_IMAGE_BUCKET = 'clatutor-student-image';
const s3 = new AWS.S3();
const STUDENT_TABLE = 'student_general_info';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
};

const getUserFromToken = (event) => {
  if (!JWT_SECRET) return null;
  try {
    const headers = event.headers || {};
    const authHeader = headers.Authorization || headers.authorization || '';
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
};

const ensureGeneralInfoSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${STUDENT_TABLE} (
      student_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      img_url VARCHAR(1000),
      name VARCHAR(40),
      email VARCHAR(50),
      phone BIGINT UNIQUE,
      dob DATE,
      previous_organisation VARCHAR(50),
      batch VARCHAR(20),
      branch VARCHAR(30),
      stream VARCHAR(50),
      address VARCHAR(1000),
      source_of_info VARCHAR(100),
      targetYear VARCHAR(50),
      added_by VARCHAR(100),
      password VARCHAR(50) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    AUTO_INCREMENT = 2026001
  `);

  const ensureColumn = async (columnName, ddl) => {
    const [rows] = await connection.execute(
      `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
      `,
      [STUDENT_TABLE, columnName],
    );

    if (Array.isArray(rows) && rows[0] && Number(rows[0].cnt) === 0) {
      await connection.execute(`ALTER TABLE ${STUDENT_TABLE} ADD COLUMN ${ddl}`);
    }
  };

  await ensureColumn('img_url', 'img_url VARCHAR(1000)');
  await ensureColumn('name', 'name VARCHAR(40)');
  await ensureColumn('email', 'email VARCHAR(50)');
  await ensureColumn('phone', 'phone BIGINT UNIQUE');
  await ensureColumn('dob', 'dob DATE');
  await ensureColumn('previous_organisation', 'previous_organisation VARCHAR(50)');
  await ensureColumn('batch', 'batch VARCHAR(20)');
  await ensureColumn('branch', 'branch VARCHAR(30)');
  await ensureColumn('stream', 'stream VARCHAR(50)');
  await ensureColumn('address', 'address VARCHAR(1000)');
  await ensureColumn('source_of_info', 'source_of_info VARCHAR(100)');
  await ensureColumn('targetYear', 'targetYear VARCHAR(50)');
  await ensureColumn('added_by', 'added_by VARCHAR(100)');
  await ensureColumn('password', 'password VARCHAR(50) UNIQUE');
  await ensureColumn('created_at', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
};

const generatePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const random = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars[random[i] % chars.length];
  }
  return out;
};

const normalizeBase64Payload = (input) => {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const commaIndex = trimmed.indexOf(',');
  return commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
};

const uploadImageToS3IfProvided = async (data) => {
  const imgBase64 = data?.img_base64 != null ? String(data.img_base64) : '';
  const imgFileName = data?.img_file_name != null ? String(data.img_file_name).trim() : '';
  const imgFileType = data?.img_file_type != null ? String(data.img_file_type).trim() : '';

  if (!imgBase64) return null;

  if (!imgFileName || !imgFileType) {
    throw new Error('img_file_name and img_file_type are required when img_base64 is provided');
  }

  const base64Data = normalizeBase64Payload(imgBase64);
  if (!base64Data) {
    throw new Error('img_base64 is empty or invalid');
  }

  const fileBuffer = Buffer.from(base64Data, 'base64');
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Unable to decode img_base64');
  }

  await s3
    .putObject({
      Bucket: STUDENT_IMAGE_BUCKET,
      Key: imgFileName,
      Body: fileBuffer,
      ContentType: imgFileType,
    })
    .promise();

  return imgFileName;
};

export const handler = async (event) => {
  const { httpMethod, body, queryStringParameters } = event;

  let parsedBody = null;
  if (body) {
    try {
      parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
    } catch (e) {
      console.error('Error parsing body:', e);
    }
  }

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS OK' }) };
  }

  try {
    if (httpMethod === 'GET' && queryStringParameters?.action === 'get_download_url') {
      return await generateDownloadUrl(queryStringParameters);
    }

    if (httpMethod === 'POST' && parsedBody?.action === 'get_upload_url') {
      return await generateUploadUrl(parsedBody);
    }

    if (httpMethod === 'POST' && parsedBody?.action === 'login') {
      return await loginStudent(parsedBody || body);
    }

    switch (httpMethod) {
      case 'GET':
        return await getGeneralInfo(queryStringParameters);
      case 'POST':
        return await createGeneralInfo(parsedBody || body, event);
      case 'PUT':
        return await updateGeneralInfo(parsedBody || body, event);
      case 'DELETE':
        return await deleteGeneralInfo(parsedBody || body);
      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};

const loginStudent = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const email = data?.email != null ? String(data.email).trim() : '';
    const password = data?.password != null ? String(data.password) : '';
    if (!email || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Email and password are required' }),
      };
    }

    connection = await pool.getConnection();
    await ensureGeneralInfoSchema(connection);
    const [rows] = await connection.execute(
      `SELECT student_id, img_url, name, email, phone, dob, previous_organisation, batch, branch, stream, address, source_of_info, targetYear, added_by, created_at
       FROM ${STUDENT_TABLE} WHERE email = ? AND password = ? LIMIT 1`,
      [email, password],
    );

    if (!rows.length) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid email or password' }),
      };
    }

    const student = rows[0];
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Login successful',
        student: {
          student_id: student.student_id,
          img_url: student.img_url,
          name: student.name,
          email: student.email,
          phone: student.phone,
          dob: student.dob,
          previous_organisation: student.previous_organisation,
          batch: student.batch,
          branch: student.branch,
          stream: student.stream,
          address: student.address,
          source_of_info: student.source_of_info,
          targetYear: student.targetYear,
          added_by: student.added_by,
          created_at: student.created_at,
        },
      }),
    };
  } catch (error) {
    console.error('Error in loginStudent:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (_) {}
    }
  }
};

const getGeneralInfo = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureGeneralInfoSchema(connection);
    const params = queryStringParameters || {};
    const student_id = params.student_id != null ? cleanParam(params.student_id) : (params.id != null ? cleanParam(params.id) : null);
    const name = params.name != null ? cleanParam(params.name) : null;
    const email = params.email != null ? cleanParam(params.email) : null;
    const phone = params.phone != null ? cleanParam(params.phone) : null;
    const targetYear = params.targetYear != null ? cleanParam(params.targetYear) : null;

    let query = `SELECT student_id, img_url, name, email, password, phone, dob, previous_organisation, batch, branch, stream, address, source_of_info, targetYear, added_by, created_at FROM ${STUDENT_TABLE} WHERE 1=1`;
    const queryParams = [];

    if (student_id) {
      query += ' AND student_id = ?';
      queryParams.push(parseInt(student_id, 10));
    }
    if (name) {
      query += ' AND name LIKE ?';
      queryParams.push(`%${name}%`);
    }
    if (email) {
      query += ' AND email = ?';
      queryParams.push(email);
    }
    if (phone) {
      query += ' AND phone = ?';
      queryParams.push(Number(phone));
    }
    if (targetYear) {
      query += ' AND targetYear = ?';
      queryParams.push(targetYear);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(rows),
    };
  } catch (error) {
    console.error('Error in getGeneralInfo:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (releaseError) {
        console.error('Error releasing connection:', releaseError);
      }
    }
  }
};

const createGeneralInfo = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }

    const name = data.name != null ? String(data.name).trim() : '';
    const email = data.email != null ? String(data.email).trim() : '';
    const phoneRaw = data.phone != null ? String(data.phone).trim() : '';
    let imgUrl = data.img_url != null ? String(data.img_url).trim() : null;
    const dob = data.dob != null ? String(data.dob).trim() : null;
    const previousOrganisation = data.previous_organisation != null ? String(data.previous_organisation).trim() : null;
    const batch = data.batch != null ? String(data.batch).trim() : null;
    const branch = data.branch != null ? String(data.branch).trim() : null;
    const stream = data.stream != null ? String(data.stream).trim() : null;
    const address = data.address != null ? String(data.address).trim() : null;
    const sourceOfInfo = data.source_of_info != null ? String(data.source_of_info).trim() : null;
    const targetYear = data.targetYear != null ? String(data.targetYear).trim() : null;
    const userFromToken = event ? getUserFromToken(event) : null;
    const addedBy = userFromToken ? (userFromToken.email || userFromToken.name || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    if (!name || !email || !phoneRaw) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'name, email, and phone are required' }),
      };
    }

    const phone = Number(phoneRaw);
    if (!Number.isFinite(phone)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'phone must be a number' }),
      };
    }

    const uploadedKey = await uploadImageToS3IfProvided(data);
    if (uploadedKey) imgUrl = uploadedKey;

    connection = await pool.getConnection();
    await ensureGeneralInfoSchema(connection);
    let result;
    let generatedPassword = null;
    let attempts = 0;
    while (attempts < 5) {
      attempts += 1;
      generatedPassword = generatePassword();
      try {
        const insertQuery = `
          INSERT INTO ${STUDENT_TABLE}
            (img_url, name, email, phone, dob, previous_organisation, batch, branch, stream, address, source_of_info, targetYear, added_by, password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const insertParams = [
          imgUrl || null,
          name,
          email,
          phone,
          dob || null,
          previousOrganisation || null,
          batch || null,
          branch || null,
          stream || null,
          address || null,
          sourceOfInfo || null,
          targetYear || null,
          addedBy || null,
          generatedPassword,
        ];
        [result] = await connection.execute(insertQuery, insertParams);
        break;
      } catch (insertError) {
        // Retry only on rare password collision from unique constraint.
        if (
          insertError &&
          insertError.code === 'ER_DUP_ENTRY' &&
          String(insertError.message || '').toLowerCase().includes('password') &&
          attempts < 5
        ) {
          continue;
        }
        throw insertError;
      }
    }
    if (!result) {
      throw new Error('Unable to create student profile after retrying password generation');
    }
    connection.release();

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Student profile created successfully',
        student_id: result.insertId,
        img_url: imgUrl || null,
        password: generatedPassword,
      }),
    };
  } catch (error) {
    if (connection) {
      try {
        connection.release();
      } catch (_) {}
    }
    console.error('Error creating general info:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      const msg = String(error.message || '').toLowerCase();
      let friendly = 'Duplicate value found. Please use unique details.';
      if (msg.includes('phone')) friendly = 'Phone number already exists.';
      else if (msg.includes('email')) friendly = 'Email already exists.';
      else if (msg.includes('password')) friendly = 'Please retry creating student.';
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ message: friendly }),
      };
    }
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};

const updateGeneralInfo = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }

    const idRaw = data.student_id !== undefined && data.student_id !== null ? data.student_id : data.id;
    const student_id = idRaw !== undefined && idRaw !== null ? parseInt(idRaw, 10) : null;
    if (student_id === null || Number.isNaN(student_id)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'student_id (or id) is required to update student profile' }),
      };
    }

    const uploadedKey = await uploadImageToS3IfProvided(data);

    connection = await pool.getConnection();
    await ensureGeneralInfoSchema(connection);
    const [existing] = await connection.execute(`SELECT student_id FROM ${STUDENT_TABLE} WHERE student_id = ?`, [student_id]);
    if (existing.length === 0) {
      connection.release();
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Record not found' }),
      };
    }

    const updateFields = [];
    const updateParams = [];

    if (data.name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push((data.name == null ? null : String(data.name).trim()) || null);
    }
    if (data.email !== undefined) {
      updateFields.push('email = ?');
      updateParams.push((data.email == null ? null : String(data.email).trim()) || null);
    }
    if (data.phone !== undefined) {
      const p = data.phone == null || String(data.phone).trim() === '' ? null : Number(String(data.phone).trim());
      if (p === null || Number.isFinite(p)) {
        updateFields.push('phone = ?');
        updateParams.push(p);
      }
    }
    if (data.img_url !== undefined) {
      updateFields.push('img_url = ?');
      updateParams.push((data.img_url == null ? null : String(data.img_url).trim()) || null);
    }
    if (data.dob !== undefined) {
      updateFields.push('dob = ?');
      updateParams.push((data.dob == null ? null : String(data.dob).trim()) || null);
    }
    if (data.previous_organisation !== undefined) {
      updateFields.push('previous_organisation = ?');
      updateParams.push((data.previous_organisation == null ? null : String(data.previous_organisation).trim()) || null);
    }
    if (data.batch !== undefined) {
      updateFields.push('batch = ?');
      updateParams.push((data.batch == null ? null : String(data.batch).trim()) || null);
    }
    if (data.branch !== undefined) {
      updateFields.push('branch = ?');
      updateParams.push((data.branch == null ? null : String(data.branch).trim()) || null);
    }
    if (data.stream !== undefined) {
      updateFields.push('stream = ?');
      updateParams.push((data.stream == null ? null : String(data.stream).trim()) || null);
    }
    if (data.address !== undefined) {
      updateFields.push('address = ?');
      updateParams.push((data.address == null ? null : String(data.address).trim()) || null);
    }
    if (data.source_of_info !== undefined) {
      updateFields.push('source_of_info = ?');
      updateParams.push((data.source_of_info == null ? null : String(data.source_of_info).trim()) || null);
    }
    if (data.targetYear !== undefined) {
      updateFields.push('targetYear = ?');
      updateParams.push((data.targetYear == null ? null : String(data.targetYear).trim()) || null);
    }
    if (data.added_by !== undefined) {
      updateFields.push('added_by = ?');
      updateParams.push((data.added_by == null ? null : String(data.added_by).trim()) || null);
    }
    if (data.regenerate_password === true) {
      updateFields.push('password = ?');
      updateParams.push(generatePassword());
    }
    if (uploadedKey) {
      updateFields.push('img_url = ?');
      updateParams.push(uploadedKey);
    }

    if (updateFields.length === 0) {
      connection.release();
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No fields to update' }),
      };
    }

    updateParams.push(student_id);
    const updateQuery = `UPDATE ${STUDENT_TABLE} SET ${updateFields.join(', ')} WHERE student_id = ?`;
    await connection.execute(updateQuery, updateParams);
    connection.release();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Student profile updated successfully' }),
    };
  } catch (error) {
    if (connection) {
      try {
        connection.release();
      } catch (_) {}
    }
    console.error('Error updating general info:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};

const generateUploadUrl = async (body) => {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const fileName = data?.fileName ? String(data.fileName).trim() : '';
    const fileType = data?.fileType ? String(data.fileType).trim() : '';

    if (!fileName || !fileType) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'fileName and fileType are required' }),
      };
    }

    const uploadUrl = await s3.getSignedUrlPromise('putObject', {
      Bucket: STUDENT_IMAGE_BUCKET,
      Key: fileName,
      Expires: 300,
      ContentType: fileType,
    });

    const fileUrl = `https://${STUDENT_IMAGE_BUCKET}.s3.amazonaws.com/${fileName}`;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        uploadUrl,
        key: fileName,
        fileUrl,
        bucket: STUDENT_IMAGE_BUCKET,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to generate upload URL', error: error.message }),
    };
  }
};

const generateDownloadUrl = async (queryStringParameters) => {
  try {
    const key = queryStringParameters?.key ? String(queryStringParameters.key).trim() : '';
    const filename = queryStringParameters?.filename ? String(queryStringParameters.filename).trim() : '';

    if (!key) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'key is required' }),
      };
    }

    const inline =
      queryStringParameters?.inline === '1' || queryStringParameters?.inline === 'true';
    const dispositionType = inline ? 'inline' : 'attachment';
    const downloadUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: STUDENT_IMAGE_BUCKET,
      Key: key,
      Expires: 300,
      ResponseContentDisposition: `${dispositionType}; filename="${filename || key}"`,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        downloadUrl,
        key,
        filename: filename || key,
        bucket: STUDENT_IMAGE_BUCKET,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to generate download URL', error: error.message }),
    };
  }
};

const deleteGeneralInfo = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }

    let ids = [];
    if (Array.isArray(data.ids)) {
      ids = data.ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    } else if (data.student_id !== undefined && data.student_id !== null) {
      const n = parseInt(data.student_id, 10);
      if (!Number.isNaN(n)) ids = [n];
    } else if (data.id !== undefined && data.id !== null) {
      const n = parseInt(data.id, 10);
      if (!Number.isNaN(n)) ids = [n];
    }

    if (ids.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Provide id or ids array to delete' }),
      };
    }

    connection = await pool.getConnection();
    await ensureGeneralInfoSchema(connection);
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT student_id, img_url FROM ${STUDENT_TABLE} WHERE student_id IN (${placeholders})`,
      ids,
    );
    if (!rows.length) {
      connection.release();
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No record(s) found to delete' }),
      };
    }
    const s3Keys = rows.flatMap((r) => keysFromImageField(r.img_url));
    await deleteS3Objects(s3, STUDENT_IMAGE_BUCKET, s3Keys);
    const deleteQuery = `DELETE FROM ${STUDENT_TABLE} WHERE student_id IN (${placeholders})`;
    const [result] = await connection.execute(deleteQuery, ids);
    connection.release();

    if (result.affectedRows === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No record(s) found to delete' }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Record(s) deleted successfully',
        deletedCount: result.affectedRows,
      }),
    };
  } catch (error) {
    if (connection) {
      try {
        connection.release();
      } catch (_) {}
    }
    console.error('Error deleting general info:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};