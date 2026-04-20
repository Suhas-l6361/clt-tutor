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
const CLASS_TABLE_NAME = 'class';
const CLASS_TABLE = '`class`';
const CLASS_IMAGE_BUCKET = 'clututor-class-image';
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

const normalizeImageUrlJson = (val) => {
  if (val == null) return null;
  if (Array.isArray(val)) return JSON.stringify(val);
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t);
      return JSON.stringify(Array.isArray(p) ? p : [p]);
    } catch {
      return JSON.stringify([t]);
    }
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return null;
};

const ensureClassSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${CLASS_TABLE}(
      id INT PRIMARY KEY AUTO_INCREMENT,
      image_url JSON,
      location VARCHAR(50),
      added_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const [rows] = await connection.execute(
    `
      SELECT DATA_TYPE AS dt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'image_url'
    `,
    [CLASS_TABLE_NAME],
  );
  if (Array.isArray(rows) && rows[0] && String(rows[0].dt).toLowerCase() === 'varchar') {
    await connection.execute(`ALTER TABLE ${CLASS_TABLE} MODIFY COLUMN image_url JSON`);
  }
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
      Bucket: CLASS_IMAGE_BUCKET,
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
        fileUrl: `https://${CLASS_IMAGE_BUCKET}.s3.amazonaws.com/${fileName}`,
        bucket: CLASS_IMAGE_BUCKET,
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
    if (!key) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'key is required' }) };
    const inline =
      queryStringParameters?.inline === '1' || queryStringParameters?.inline === 'true';
    const dispositionType = inline ? 'inline' : 'attachment';
    const downloadUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: CLASS_IMAGE_BUCKET,
      Key: key,
      Expires: 300,
      ResponseContentDisposition: `${dispositionType}; filename="${filename || key}"`,
    });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ downloadUrl, key, filename: filename || key, bucket: CLASS_IMAGE_BUCKET }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Failed to generate download URL', error: error.message }) };
  }
};

const getClassItems = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureClassSchema(connection);
    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const location = params.location != null ? cleanParam(params.location) : null;
    const addedBy = params.added_by != null ? cleanParam(params.added_by) : null;

    let query = `SELECT id, image_url, location, added_by, created_at FROM ${CLASS_TABLE} WHERE 1=1`;
    const queryParams = [];
    if (id) {
      query += ' AND id = ?';
      queryParams.push(parseInt(id, 10));
    }
    if (location) {
      query += ' AND location LIKE ?';
      queryParams.push(`%${location}%`);
    }
    if (addedBy) {
      query += ' AND added_by = ?';
      queryParams.push(addedBy);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('Error in getClassItems:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createClassItem = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };

    const imageJson = normalizeImageUrlJson(data.image_url);
    const location = data.location != null ? String(data.location).trim() : '';
    const userFromToken = getUserFromToken(event);
    const addedBy = userFromToken ? (userFromToken.email || userFromToken.name || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    let keys = [];
    try {
      keys = imageJson ? JSON.parse(imageJson) : [];
    } catch {
      keys = [];
    }
    if (!Array.isArray(keys) || keys.length === 0 || !location) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'image_url (non-empty array of file keys) and location are required' }) };
    }

    connection = await pool.getConnection();
    await ensureClassSchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO ${CLASS_TABLE} (image_url, location, added_by) VALUES (?, ?, ?)`,
      [imageJson, location, addedBy || null],
    );
    return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ message: 'Class item created successfully', id: result.insertId }) };
  } catch (error) {
    console.error('Error in createClassItem:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateClassItem = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };

    const id = data.id != null ? parseInt(data.id, 10) : null;
    if (id == null || Number.isNaN(id)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'id is required' }) };

    connection = await pool.getConnection();
    await ensureClassSchema(connection);
    const [existing] = await connection.execute(`SELECT id FROM ${CLASS_TABLE} WHERE id = ?`, [id]);
    if (!existing.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Record not found' }) };

    const updateFields = [];
    const updateParams = [];
    if (data.image_url !== undefined) {
      const j = normalizeImageUrlJson(data.image_url);
      updateFields.push('image_url = ?');
      updateParams.push(j);
    }
    if (data.location !== undefined) { updateFields.push('location = ?'); updateParams.push((data.location == null ? null : String(data.location).trim()) || null); }
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

    if (!updateFields.length) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };

    updateParams.push(id);
    await connection.execute(`UPDATE ${CLASS_TABLE} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Class item updated successfully' }) };
  } catch (error) {
    console.error('Error in updateClassItem:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteClassItem = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    let ids = [];
    if (Array.isArray(data.ids)) ids = data.ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    else if (data.id !== undefined && data.id !== null) {
      const n = parseInt(data.id, 10);
      if (!Number.isNaN(n)) ids = [n];
    }
    if (!ids.length) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Provide id or ids array to delete' }) };

    connection = await pool.getConnection();
    await ensureClassSchema(connection);
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT id, image_url FROM ${CLASS_TABLE} WHERE id IN (${placeholders})`,
      ids,
    );
    if (!rows.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    const s3Keys = rows.flatMap((r) => keysFromImageField(r.image_url));
    await deleteS3Objects(s3, CLASS_IMAGE_BUCKET, s3Keys);
    const [result] = await connection.execute(`DELETE FROM ${CLASS_TABLE} WHERE id IN (${placeholders})`, ids);
    if (!result.affectedRows) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Record(s) deleted successfully', deletedCount: result.affectedRows }) };
  } catch (error) {
    console.error('Error in deleteClassItem:', error);
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

  if (httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS OK' }) };

  try {
    if (httpMethod === 'GET' && queryStringParameters?.action === 'get_download_url') return await generateDownloadUrl(queryStringParameters);
    if (httpMethod === 'POST' && parsedBody?.action === 'get_upload_url') return await generateUploadUrl(parsedBody);

    switch (httpMethod) {
      case 'GET':
        return await getClassItems(queryStringParameters);
      case 'POST':
        return await createClassItem(parsedBody || body, event);
      case 'PUT':
        return await updateClassItem(parsedBody || body, event);
      case 'DELETE':
        return await deleteClassItem(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
