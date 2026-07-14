import { pool } from './db.js';
import jwt from 'jsonwebtoken';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const JWT_SECRET = process.env.JWT_SECRET;
const TABLE = 'courseView';

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
    console.error('JWT:', error);
    return null;
  }
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      video_id INT PRIMARY KEY AUTO_INCREMENT,
      video_url VARCHAR(1000),
      added_by VARCHAR(100),
      isSaved BOOL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      [TABLE, columnName],
    );
    if (Array.isArray(rows) && rows[0] && Number(rows[0].cnt) === 0) {
      await connection.execute(`ALTER TABLE ${TABLE} ADD COLUMN ${ddl}`);
    }
  };

  await ensureColumn('video_url', 'video_url VARCHAR(1000)');
  await ensureColumn('added_by', 'added_by VARCHAR(100)');
  await ensureColumn('isSaved', 'isSaved BOOL DEFAULT FALSE');
  await ensureColumn('created_at', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
};

const getViews = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const videoIdRaw = params.video_id != null ? params.video_id : null;
    const addedBy = params.added_by != null ? String(params.added_by).trim() : '';

    let query = `SELECT video_id, video_url, added_by, isSaved, created_at FROM ${TABLE} WHERE 1=1`;
    const queryParams = [];
    if (videoIdRaw != null) {
      const videoId = parseInt(String(videoIdRaw), 10);
      if (!Number.isFinite(videoId)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid video_id' }) };
      }
      query += ' AND video_id = ?';
      queryParams.push(videoId);
    }
    if (addedBy) {
      query += ' AND added_by = ?';
      queryParams.push(addedBy);
    }
    query += ' ORDER BY created_at DESC';

    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('getViews:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const upsertView = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const videoId = data.video_id != null ? parseInt(String(data.video_id), 10) : NaN;
    const videoUrl = data.video_url != null ? String(data.video_url).trim() : '';
    if (!Number.isFinite(videoId) || videoId <= 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'video_id is required' }) };
    }
    if (!videoUrl) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'video_url is required' }) };
    }

    const user = getUserFromToken(event);
    const addedBy = user
      ? (user.email || user.name || user.sub || null)
      : (data.added_by != null ? String(data.added_by).trim() : null);
    const isSaved = data.isSaved === true || data.isSaved === 1 || data.isSaved === '1';

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [exists] = await connection.execute(`SELECT video_id FROM ${TABLE} WHERE video_id = ? LIMIT 1`, [videoId]);
    if (exists.length) {
      await connection.execute(
        `UPDATE ${TABLE} SET video_url = ?, added_by = ?, isSaved = ? WHERE video_id = ?`,
        [videoUrl, addedBy || null, isSaved ? 1 : 0, videoId],
      );
    } else {
      await connection.execute(
        `INSERT INTO ${TABLE} (video_id, video_url, added_by, isSaved) VALUES (?, ?, ?, ?)`,
        [videoId, videoUrl, addedBy || null, isSaved ? 1 : 0],
      );
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Course view saved', video_id: videoId, isSaved }) };
  } catch (error) {
    console.error('upsertView:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteView = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const videoId = data?.video_id != null ? parseInt(String(data.video_id), 10) : NaN;
    if (!Number.isFinite(videoId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'video_id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    await connection.execute(`DELETE FROM ${TABLE} WHERE video_id = ?`, [videoId]);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Course view deleted', video_id: videoId }) };
  } catch (error) {
    console.error('deleteView:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

export const handler = async (event) => {
  const { httpMethod, body, queryStringParameters } = event;

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS OK' }) };
  }

  let parsedBody = null;
  if (body) {
    try {
      parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
    } catch (e) {
      console.error('Body parse:', e);
    }
  }

  try {
    switch (httpMethod) {
      case 'GET':
        return await getViews(queryStringParameters);
      case 'POST':
      case 'PUT':
        return await upsertView(parsedBody || body, event);
      case 'DELETE':
        return await deleteView(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('handler:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
