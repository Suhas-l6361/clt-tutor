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
const CURRENT_AFFAIRS_TABLE = 'currentAffairs';
const CURRENT_AFFAIRS_BUCKET = 'clututor-ca-images';
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

const normalizeImgUrlJson = (val) => {
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

const ensureCurrentAffairsSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${CURRENT_AFFAIRS_TABLE}(
      id INT PRIMARY KEY AUTO_INCREMENT,
      date DATE,
      name VARCHAR(50),
      img_url JSON,
      links VARCHAR(5000),
      added_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'file'
    `,
    [CURRENT_AFFAIRS_TABLE],
  );
  if (Array.isArray(rows) && rows[0] && Number(rows[0].cnt) > 0) {
    await connection.execute(`ALTER TABLE ${CURRENT_AFFAIRS_TABLE} CHANGE file img_url JSON`);
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
      Bucket: CURRENT_AFFAIRS_BUCKET,
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
        fileUrl: `https://${CURRENT_AFFAIRS_BUCKET}.s3.amazonaws.com/${fileName}`,
        bucket: CURRENT_AFFAIRS_BUCKET,
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
      Bucket: CURRENT_AFFAIRS_BUCKET,
      Key: key,
      Expires: 300,
      ResponseContentDisposition: `${dispositionType}; filename="${filename || key}"`,
    });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ downloadUrl, key, filename: filename || key, bucket: CURRENT_AFFAIRS_BUCKET }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Failed to generate download URL', error: error.message }) };
  }
};

const getCurrentAffairs = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureCurrentAffairsSchema(connection);

    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const name = params.name != null ? cleanParam(params.name) : null;
    const date = params.date != null ? cleanParam(params.date) : null;

    let query = `SELECT id, date, name, img_url, links, added_by, created_at FROM ${CURRENT_AFFAIRS_TABLE} WHERE 1=1`;
    const queryParams = [];
    if (id) {
      query += ' AND id = ?';
      queryParams.push(parseInt(id, 10));
    }
    if (name) {
      query += ' AND name LIKE ?';
      queryParams.push(`%${name}%`);
    }
    if (date) {
      query += ' AND date = ?';
      queryParams.push(date);
    }
    query += ' ORDER BY date DESC, created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('Error in getCurrentAffairs:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createCurrentAffairs = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };

    const date =
      data.date != null && String(data.date).trim() !== '' ? String(data.date).trim() : null;
    const name =
      data.name != null && String(data.name).trim() !== '' ? String(data.name).trim() : null;
    const imgUrl = data.img_url !== undefined ? data.img_url : (data.file !== undefined ? data.file : null);
    const links = data.links != null && String(data.links).trim() !== '' ? String(data.links).trim() : null;
    const userFromToken = getUserFromToken(event);
    const addedBy = userFromToken ? (userFromToken.email || userFromToken.name || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    const imgJson = normalizeImgUrlJson(imgUrl);
    if (!date && !name && !links && !imgJson) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'Provide at least one of: date, title, links, or uploaded file(s).',
        }),
      };
    }
    connection = await pool.getConnection();
    await ensureCurrentAffairsSchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO ${CURRENT_AFFAIRS_TABLE} (date, name, img_url, links, added_by) VALUES (?, ?, ?, ?, ?)`,
      [date, name, imgJson, links, addedBy || null],
    );
    return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ message: 'Current affairs item created successfully', id: result.insertId }) };
  } catch (error) {
    console.error('Error in createCurrentAffairs:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateCurrentAffairs = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    const id = data.id != null ? parseInt(data.id, 10) : null;
    if (id == null || Number.isNaN(id)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'id is required' }) };

    connection = await pool.getConnection();
    await ensureCurrentAffairsSchema(connection);
    const [existing] = await connection.execute(`SELECT id FROM ${CURRENT_AFFAIRS_TABLE} WHERE id = ?`, [id]);
    if (!existing.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Record not found' }) };

    const updateFields = [];
    const updateParams = [];
    if (data.date !== undefined) { updateFields.push('date = ?'); updateParams.push((data.date == null ? null : String(data.date).trim()) || null); }
    if (data.name !== undefined) { updateFields.push('name = ?'); updateParams.push((data.name == null ? null : String(data.name).trim()) || null); }
    if (data.img_url !== undefined || data.file !== undefined) {
      const raw = data.img_url !== undefined ? data.img_url : data.file;
      const j = normalizeImgUrlJson(raw);
      updateFields.push('img_url = ?');
      updateParams.push(j);
    }
    if (data.links !== undefined) { updateFields.push('links = ?'); updateParams.push((data.links == null ? null : String(data.links).trim()) || null); }
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
    await connection.execute(`UPDATE ${CURRENT_AFFAIRS_TABLE} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Current affairs item updated successfully' }) };
  } catch (error) {
    console.error('Error in updateCurrentAffairs:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteCurrentAffairs = async (body) => {
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
    await ensureCurrentAffairsSchema(connection);
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT id, img_url FROM ${CURRENT_AFFAIRS_TABLE} WHERE id IN (${placeholders})`,
      ids,
    );
    if (!rows.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    }
    const s3Keys = rows.flatMap((r) => keysFromImageField(r.img_url));
    await deleteS3Objects(s3, CURRENT_AFFAIRS_BUCKET, s3Keys);
    const [result] = await connection.execute(`DELETE FROM ${CURRENT_AFFAIRS_TABLE} WHERE id IN (${placeholders})`, ids);
    if (!result.affectedRows) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Record(s) deleted successfully', deletedCount: result.affectedRows }) };
  } catch (error) {
    console.error('Error in deleteCurrentAffairs:', error);
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
        return await getCurrentAffairs(queryStringParameters);
      case 'POST':
        return await createCurrentAffairs(parsedBody || body, event);
      case 'PUT':
        return await updateCurrentAffairs(parsedBody || body, event);
      case 'DELETE':
        return await deleteCurrentAffairs(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
