import { pool } from './db.js';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';
import { keysFromImageField, deleteS3Objects } from './s3-delete-helper.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const JWT_SECRET = process.env.JWT_SECRET;
const FACULTY_TABLE = 'faculty';
const FACULTY_IMAGE_BUCKET = 'clututor-faculty-image';
const s3 = new AWS.S3();

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
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
};

const ensureFacultySchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${FACULTY_TABLE}(
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      email VARCHAR(100),
      phone BIGINT,
      img_url VARCHAR(1000),
      education VARCHAR(50),
      city VARCHAR(30),
      branch VARCHAR(30),
      address VARCHAR(100),
      password VARCHAR(10) UNIQUE,
      added_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    AUTO_INCREMENT = 20211
  `);
};

const generateUploadUrl = async (body) => {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const fileName = data?.fileName ? String(data.fileName).trim() : '';
    const fileType = data?.fileType ? String(data.fileType).trim() : '';
    if (!fileName || !fileType) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'fileName and fileType are required' }) };
    }

    const uploadUrl = await s3.getSignedUrlPromise('putObject', {
      Bucket: FACULTY_IMAGE_BUCKET,
      Key: fileName,
      Expires: 300,
      ContentType: fileType,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        uploadUrl,
        key: fileName,
        fileUrl: `https://${FACULTY_IMAGE_BUCKET}.s3.amazonaws.com/${fileName}`,
        bucket: FACULTY_IMAGE_BUCKET,
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Failed to generate upload URL', error: error.message }) };
  }
};

const generateDownloadUrl = async (queryStringParameters) => {
  try {
    const key = queryStringParameters?.key ? String(queryStringParameters.key).trim() : '';
    const filename = queryStringParameters?.filename ? String(queryStringParameters.filename).trim() : '';
    if (!key) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'key is required' }) };
    }
    const inline =
      queryStringParameters?.inline === '1' || queryStringParameters?.inline === 'true';
    const dispositionType = inline ? 'inline' : 'attachment';
    const downloadUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: FACULTY_IMAGE_BUCKET,
      Key: key,
      Expires: 300,
      ResponseContentDisposition: `${dispositionType}; filename="${filename || key}"`,
    });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ downloadUrl, key, filename: filename || key, bucket: FACULTY_IMAGE_BUCKET }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Failed to generate download URL', error: error.message }) };
  }
};

const getFaculty = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureFacultySchema(connection);

    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const name = params.name != null ? cleanParam(params.name) : null;
    const email = params.email != null ? cleanParam(params.email) : null;
    const branch = params.branch != null ? cleanParam(params.branch) : null;
    const city = params.city != null ? cleanParam(params.city) : null;
    const phone = params.phone != null ? cleanParam(params.phone) : null;

    let query = `SELECT id, name, email, phone, img_url, education, city, branch, address, password, added_by, created_at FROM ${FACULTY_TABLE} WHERE 1=1`;
    const queryParams = [];
    if (id) {
      query += ' AND id = ?';
      queryParams.push(parseInt(id, 10));
    }
    if (name) {
      query += ' AND name LIKE ?';
      queryParams.push(`%${name}%`);
    }
    if (email) {
      query += ' AND email = ?';
      queryParams.push(email);
    }
    if (branch) {
      query += ' AND branch = ?';
      queryParams.push(branch);
    }
    if (city) {
      query += ' AND city = ?';
      queryParams.push(city);
    }
    if (phone) {
      query += ' AND phone = ?';
      queryParams.push(Number(phone));
    }
    query += ' ORDER BY created_at DESC';

    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('Error in getFaculty:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createFaculty = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const name = data.name != null ? String(data.name).trim() : '';
    const email = data.email != null ? String(data.email).trim() : '';
    const phoneRaw = data.phone != null ? String(data.phone).trim() : '';
    const imgUrl = data.img_url != null ? String(data.img_url).trim() : null;
    const education = data.education != null ? String(data.education).trim() : null;
    const city = data.city != null ? String(data.city).trim() : null;
    const branch = data.branch != null ? String(data.branch).trim() : null;
    const address = data.address != null ? String(data.address).trim() : null;
    const password = data.password != null ? String(data.password).trim() : '';
    const userFromToken = getUserFromToken(event);
    const addedBy = userFromToken ? (userFromToken.email || userFromToken.name || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    if (!name || !email || !phoneRaw || !password) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'name, email, phone, and password are required' }) };
    }

    const phone = Number(phoneRaw);
    if (!Number.isFinite(phone)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'phone must be a number' }) };
    }

    connection = await pool.getConnection();
    await ensureFacultySchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO ${FACULTY_TABLE} (name, email, phone, img_url, education, city, branch, address, password, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, phone, imgUrl || null, education || null, city || null, branch || null, address || null, password, addedBy || null],
    );
    return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ message: 'Faculty created successfully', id: result.insertId }) };
  } catch (error) {
    console.error('Error in createFaculty:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Duplicate value found (email/password must be unique).' }) };
    }
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateFaculty = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const id = data.id != null ? parseInt(data.id, 10) : null;
    if (id == null || Number.isNaN(id)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureFacultySchema(connection);
    const [existing] = await connection.execute(`SELECT id FROM ${FACULTY_TABLE} WHERE id = ?`, [id]);
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Record not found' }) };
    }

    const updateFields = [];
    const updateParams = [];
    if (data.name !== undefined) { updateFields.push('name = ?'); updateParams.push((data.name == null ? null : String(data.name).trim()) || null); }
    if (data.email !== undefined) { updateFields.push('email = ?'); updateParams.push((data.email == null ? null : String(data.email).trim()) || null); }
    if (data.phone !== undefined) {
      const p = data.phone == null || String(data.phone).trim() === '' ? null : Number(String(data.phone).trim());
      if (p === null || Number.isFinite(p)) { updateFields.push('phone = ?'); updateParams.push(p); }
    }
    if (data.img_url !== undefined) { updateFields.push('img_url = ?'); updateParams.push((data.img_url == null ? null : String(data.img_url).trim()) || null); }
    if (data.education !== undefined) { updateFields.push('education = ?'); updateParams.push((data.education == null ? null : String(data.education).trim()) || null); }
    if (data.city !== undefined) { updateFields.push('city = ?'); updateParams.push((data.city == null ? null : String(data.city).trim()) || null); }
    if (data.branch !== undefined) { updateFields.push('branch = ?'); updateParams.push((data.branch == null ? null : String(data.branch).trim()) || null); }
    if (data.address !== undefined) { updateFields.push('address = ?'); updateParams.push((data.address == null ? null : String(data.address).trim()) || null); }
    if (data.password !== undefined) { updateFields.push('password = ?'); updateParams.push((data.password == null ? null : String(data.password).trim()) || null); }
    if (data.added_by !== undefined) {
      updateFields.push('added_by = ?');
      updateParams.push((data.added_by == null ? null : String(data.added_by).trim()) || null);
    } else {
      const userFromToken = getUserFromToken(event);
      if (userFromToken) {
        updateFields.push('added_by = ?');
        updateParams.push(userFromToken.email || userFromToken.name || null);
      }
    }

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(id);
    await connection.execute(`UPDATE ${FACULTY_TABLE} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Faculty updated successfully' }) };
  } catch (error) {
    console.error('Error in updateFaculty:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteFaculty = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    let ids = [];
    if (Array.isArray(data.ids)) ids = data.ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    else if (data.id !== undefined && data.id !== null) {
      const n = parseInt(data.id, 10);
      if (!Number.isNaN(n)) ids = [n];
    }
    if (!ids.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Provide id or ids array to delete' }) };
    }

    connection = await pool.getConnection();
    await ensureFacultySchema(connection);
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT id, img_url FROM ${FACULTY_TABLE} WHERE id IN (${placeholders})`,
      ids,
    );
    if (!rows.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    }
    const s3Keys = rows.flatMap((r) => keysFromImageField(r.img_url));
    await deleteS3Objects(s3, FACULTY_IMAGE_BUCKET, s3Keys);
    const [result] = await connection.execute(`DELETE FROM ${FACULTY_TABLE} WHERE id IN (${placeholders})`, ids);
    if (!result.affectedRows) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Record(s) deleted successfully', deletedCount: result.affectedRows }) };
  } catch (error) {
    console.error('Error in deleteFaculty:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

export const handler = async (event) => {
  const { httpMethod, body, queryStringParameters } = event;
  let parsedBody = null;
  if (body) {
    try { parsedBody = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { console.error('Error parsing body:', e); }
  }

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS OK' }) };
  }

  try {
    if (httpMethod === 'GET' && queryStringParameters?.action === 'get_download_url') return await generateDownloadUrl(queryStringParameters);
    if (httpMethod === 'POST' && parsedBody?.action === 'get_upload_url') return await generateUploadUrl(parsedBody);

    switch (httpMethod) {
      case 'GET':
        return await getFaculty(queryStringParameters);
      case 'POST':
        return await createFaculty(parsedBody || body, event);
      case 'PUT':
        return await updateFaculty(parsedBody || body, event);
      case 'DELETE':
        return await deleteFaculty(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
