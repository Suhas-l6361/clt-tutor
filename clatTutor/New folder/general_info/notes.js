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
const NOTES_TABLE = 'notes';
const NOTES_BUCKET = 'clat-tutor-notes';
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

const normalizeLinkJson = (val) => {
  if (val == null) return null;
  if (Array.isArray(val)) return JSON.stringify(val.map((x) => String(x).trim()).filter(Boolean));
  if (typeof val === 'string') {
    const lines = val.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    return lines.length ? JSON.stringify(lines) : null;
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return null;
};

const ensureNotesSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${NOTES_TABLE}(
      id INT PRIMARY KEY AUTO_INCREMENT,
      Title VARCHAR(100),
      img_url JSON,
      link JSON,
      added_by VARCHAR(100),
      created_by TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
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
      [NOTES_TABLE, columnName],
    );
    if (Array.isArray(rows) && rows[0] && Number(rows[0].cnt) === 0) {
      await connection.execute(`ALTER TABLE ${NOTES_TABLE} ADD COLUMN ${ddl}`);
    }
  };
  await ensureColumn('img_url', 'img_url JSON');
  await ensureColumn('link', 'link JSON');
  const [titleCol] = await connection.execute(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'Title'
    `,
    [NOTES_TABLE],
  );
  if (Array.isArray(titleCol) && titleCol[0] && Number(titleCol[0].cnt) === 0) {
    const [detailsCol] = await connection.execute(
      `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'details'
      `,
      [NOTES_TABLE],
    );
    if (Array.isArray(detailsCol) && detailsCol[0] && Number(detailsCol[0].cnt) > 0) {
      await connection.execute(`ALTER TABLE ${NOTES_TABLE} CHANGE details Title VARCHAR(100)`);
    } else {
      await connection.execute(`ALTER TABLE ${NOTES_TABLE} ADD COLUMN Title VARCHAR(100)`);
    }
  }
  const [ct] = await connection.execute(
    `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'created_at'
    `,
    [NOTES_TABLE],
  );
  if (Array.isArray(ct) && ct[0] && Number(ct[0].cnt) > 0) {
    const [cb] = await connection.execute(
      `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'created_by'
      `,
      [NOTES_TABLE],
    );
    if (Array.isArray(cb) && cb[0] && Number(cb[0].cnt) === 0) {
      await connection.execute(`ALTER TABLE ${NOTES_TABLE} CHANGE created_at created_by TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    }
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
      Bucket: NOTES_BUCKET,
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
        fileUrl: `https://${NOTES_BUCKET}.s3.amazonaws.com/${fileName}`,
        bucket: NOTES_BUCKET,
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
      Bucket: NOTES_BUCKET,
      Key: key,
      Expires: 300,
      ResponseContentDisposition: `${dispositionType}; filename="${filename || key}"`,
    });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ downloadUrl, key, filename: filename || key, bucket: NOTES_BUCKET }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Failed to generate download URL', error: error.message }) };
  }
};

const getNotes = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureNotesSchema(connection);
    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const title = params.Title != null ? cleanParam(params.Title) : (params.title != null ? cleanParam(params.title) : (params.details != null ? cleanParam(params.details) : null));

    let query = `SELECT id, Title, img_url, link, added_by, created_by FROM ${NOTES_TABLE} WHERE 1=1`;
    const queryParams = [];
    if (id) {
      query += ' AND id = ?';
      queryParams.push(parseInt(id, 10));
    }
    if (title) {
      query += ' AND Title LIKE ?';
      queryParams.push(`%${title}%`);
    }
    query += ' ORDER BY created_by DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('Error in getNotes:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createNote = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };

    const title = data.Title != null ? String(data.Title).trim() : (data.title != null ? String(data.title).trim() : (data.details != null ? String(data.details).trim() : ''));
    const imgJson = normalizeImgUrlJson(data.img_url);
    const linkJson = normalizeLinkJson(data.link);
    const userFromToken = getUserFromToken(event);
    const addedBy = userFromToken ? (userFromToken.email || userFromToken.name || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    if (!title) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Title is required' }) };

    connection = await pool.getConnection();
    await ensureNotesSchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO ${NOTES_TABLE} (Title, img_url, link, added_by) VALUES (?, ?, ?, ?)`,
      [title, imgJson, linkJson, addedBy || null],
    );
    return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ message: 'Note created successfully', id: result.insertId }) };
  } catch (error) {
    console.error('Error in createNote:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateNote = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    const id = data.id != null ? parseInt(data.id, 10) : null;
    if (id == null || Number.isNaN(id)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'id is required' }) };

    connection = await pool.getConnection();
    await ensureNotesSchema(connection);
    const [existing] = await connection.execute(`SELECT id FROM ${NOTES_TABLE} WHERE id = ?`, [id]);
    if (!existing.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Record not found' }) };

    const updateFields = [];
    const updateParams = [];
    if (data.Title !== undefined || data.title !== undefined || data.details !== undefined) {
      const titleValue = data.Title !== undefined ? data.Title : (data.title !== undefined ? data.title : data.details);
      updateFields.push('Title = ?');
      updateParams.push((titleValue == null ? null : String(titleValue).trim()) || null);
    }
    if (data.img_url !== undefined) {
      updateFields.push('img_url = ?');
      updateParams.push(normalizeImgUrlJson(data.img_url));
    }
    if (data.link !== undefined) {
      updateFields.push('link = ?');
      updateParams.push(normalizeLinkJson(data.link));
    }
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
    await connection.execute(`UPDATE ${NOTES_TABLE} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Note updated successfully' }) };
  } catch (error) {
    console.error('Error in updateNote:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteNote = async (body) => {
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
    await ensureNotesSchema(connection);
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT id, img_url FROM ${NOTES_TABLE} WHERE id IN (${placeholders})`,
      ids,
    );
    if (!rows.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    const s3Keys = rows.flatMap((r) => keysFromImageField(r.img_url));
    await deleteS3Objects(s3, NOTES_BUCKET, s3Keys);
    const [result] = await connection.execute(`DELETE FROM ${NOTES_TABLE} WHERE id IN (${placeholders})`, ids);
    if (!result.affectedRows) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Record(s) deleted successfully', deletedCount: result.affectedRows }) };
  } catch (error) {
    console.error('Error in deleteNote:', error);
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
        return await getNotes(queryStringParameters);
      case 'POST':
        return await createNote(parsedBody || body, event);
      case 'PUT':
        return await updateNote(parsedBody || body, event);
      case 'DELETE':
        return await deleteNote(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
