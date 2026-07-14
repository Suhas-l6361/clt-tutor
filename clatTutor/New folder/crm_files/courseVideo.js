import { pool } from './db.js';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const JWT_SECRET = process.env.JWT_SECRET;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const TABLE = 'courseVideo';
const COURSE_VIDEO_BUCKET = 'clatutor-course-video';

const s3 = new AWS.S3({ region: AWS_REGION });

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
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(100),
      description VARCHAR(10000),
      video_url VARCHAR(1000),
      added_by VARCHAR(100),
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

  await ensureColumn('title', 'title VARCHAR(100)');
  await ensureColumn('description', 'description VARCHAR(10000)');
  await ensureColumn('video_url', 'video_url VARCHAR(1000)');
  await ensureColumn('added_by', 'added_by VARCHAR(100)');
  await ensureColumn('created_at', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
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
      Bucket: COURSE_VIDEO_BUCKET,
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
        fileUrl: `https://${COURSE_VIDEO_BUCKET}.s3.amazonaws.com/${fileName}`,
        bucket: COURSE_VIDEO_BUCKET,
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
    const inline = queryStringParameters?.inline === '1' || queryStringParameters?.inline === 'true';
    const dispositionType = inline ? 'inline' : 'attachment';
    const downloadUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: COURSE_VIDEO_BUCKET,
      Key: key,
      Expires: 300,
      ResponseContentDisposition: `${dispositionType}; filename="${filename || key}"`,
    });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ downloadUrl, key, filename: filename || key, bucket: COURSE_VIDEO_BUCKET }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Failed to generate download URL', error: error.message }) };
  }
};

const getVideos = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const idRaw = params.id != null ? params.id : null;
    const titleRaw = params.title != null ? String(params.title).trim() : '';

    if (idRaw != null) {
      const id = parseInt(String(idRaw), 10);
      if (!Number.isFinite(id)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid id' }) };
      }
      const [rows] = await connection.execute(
        `SELECT id, title, description, video_url, added_by, created_at FROM ${TABLE} WHERE id = ? LIMIT 1`,
        [id],
      );
      if (!rows.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows[0]) };
    }

    let query = `SELECT id, title, description, video_url, added_by, created_at FROM ${TABLE} WHERE 1=1`;
    const queryParams = [];
    if (titleRaw) {
      query += ' AND title LIKE ?';
      queryParams.push(`%${titleRaw}%`);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('getVideos:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createVideo = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const title = data.title != null ? String(data.title).trim() : '';
    const description = data.description != null ? String(data.description).trim() : '';
    const videoUrl = data.video_url != null ? String(data.video_url).trim() : '';
    if (!title || !videoUrl) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'title and video_url are required' }) };
    }

    const user = getUserFromToken(event);
    const addedBy = user ? (user.email || user.name || user.sub || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [result] = await connection.execute(
      `INSERT INTO ${TABLE} (title, description, video_url, added_by) VALUES (?, ?, ?, ?)`,
      [title, description || null, videoUrl, addedBy || null],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Course video created', id: result.insertId }),
    };
  } catch (error) {
    console.error('createVideo:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateVideo = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const id = data?.id != null ? parseInt(String(data.id), 10) : NaN;
    if (!Number.isFinite(id)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [existing] = await connection.execute(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`, [id]);
    if (!existing.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };

    const row = existing[0];
    const title = data.title != null ? String(data.title).trim() : row.title;
    const description = data.description != null ? String(data.description).trim() : row.description;
    const videoUrl = data.video_url != null ? String(data.video_url).trim() : row.video_url;
    const user = getUserFromToken(event);
    const addedBy = user ? (user.email || user.name || user.sub || row.added_by) : row.added_by;

    await connection.execute(
      `UPDATE ${TABLE} SET title = ?, description = ?, video_url = ?, added_by = ? WHERE id = ?`,
      [title || null, description || null, videoUrl || null, addedBy || null, id],
    );

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Course video updated', id }) };
  } catch (error) {
    console.error('updateVideo:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteVideo = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const id = data?.id != null ? parseInt(String(data.id), 10) : NaN;
    if (!Number.isFinite(id)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [existing] = await connection.execute(`SELECT id FROM ${TABLE} WHERE id = ? LIMIT 1`, [id]);
    if (!existing.length) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };

    await connection.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Course video deleted', id }) };
  } catch (error) {
    console.error('deleteVideo:', error);
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
    if (httpMethod === 'GET' && queryStringParameters?.action === 'get_download_url') {
      return await generateDownloadUrl(queryStringParameters);
    }
    if (httpMethod === 'POST' && parsedBody?.action === 'get_upload_url') {
      return await generateUploadUrl(parsedBody);
    }

    switch (httpMethod) {
      case 'GET':
        return await getVideos(queryStringParameters);
      case 'POST':
        return await createVideo(parsedBody || body, event);
      case 'PUT':
        return await updateVideo(parsedBody || body, event);
      case 'DELETE':
        return await deleteVideo(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('handler:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
