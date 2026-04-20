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
const TABLE = 'previous_Queation_paper';
const BUCKET_PREVIOUS_YEAR = 'previous-year-queation-paper';

const s3 = new AWS.S3({ region: AWS_REGION });

const publicObjectUrl = (bucket, key) =>
  `https://${bucket}.s3.${AWS_REGION}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

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
      year VARCHAR(50),
      queation_paper_url VARCHAR(1000),
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

  await ensureColumn('year', 'year VARCHAR(50)');
  await ensureColumn('queation_paper_url', 'queation_paper_url VARCHAR(1000)');
  await ensureColumn('added_by', 'added_by VARCHAR(100)');
  await ensureColumn('created_at', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
};

const normalizeBase64Payload = (input) => {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const commaIndex = trimmed.indexOf(',');
  return commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
};

const uploadFileToS3 = async ({ base64, fileName, contentType }) => {
  if (!base64) return null;
  if (!fileName || !contentType) {
    throw new Error('file_name and content_type are required when uploading a file');
  }
  const raw = normalizeBase64Payload(String(base64));
  if (!raw) throw new Error('file base64 is empty or invalid');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) throw new Error('Unable to decode file base64');

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `previous-question-papers/${Date.now()}-${safeName}`;

  await s3
    .putObject({
      Bucket: BUCKET_PREVIOUS_YEAR,
      Key: key,
      Body: buf,
      ContentType: String(contentType).trim(),
    })
    .promise();

  return publicObjectUrl(BUCKET_PREVIOUS_YEAR, key);
};

const parseOurS3BucketKeyFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (!(host === `${BUCKET_PREVIOUS_YEAR}.s3.${AWS_REGION}.amazonaws.com` || host.startsWith(`${BUCKET_PREVIOUS_YEAR}.s3.`))) {
      return null;
    }
    const key = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!key) return null;
    return { bucket: BUCKET_PREVIOUS_YEAR, key };
  } catch {
    return null;
  }
};

const deleteObjectIfInOurBucket = async (url) => {
  const parsed = parseOurS3BucketKeyFromUrl(url);
  if (!parsed) return;
  try {
    await s3.deleteObject({ Bucket: parsed.bucket, Key: parsed.key }).promise();
  } catch (e) {
    console.warn('S3 delete skipped:', e.message);
  }
};

const getPapers = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const idRaw = params.id != null ? params.id : null;

    if (idRaw != null) {
      const id = parseInt(String(idRaw), 10);
      if (!Number.isFinite(id)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid id' }) };
      }
      const [rows] = await connection.execute(
        `SELECT id, year, queation_paper_url, added_by, created_at FROM ${TABLE} WHERE id = ? LIMIT 1`,
        [id],
      );
      if (!rows.length) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };
      }
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows[0]) };
    }

    const [rows] = await connection.execute(
      `SELECT id, year, queation_paper_url, added_by, created_at FROM ${TABLE} ORDER BY created_at DESC`,
    );
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('getPapers:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createPaper = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const year = data.year != null ? String(data.year).trim() : '';
    if (!year) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'year is required' }) };
    }

    let queationPaperUrl = data.queation_paper_url != null ? String(data.queation_paper_url).trim() : null;
    if (data.queation_paper_base64) {
      queationPaperUrl = await uploadFileToS3({
        base64: data.queation_paper_base64,
        fileName: data.queation_paper_file_name,
        contentType: data.queation_paper_content_type || 'application/pdf',
      });
    }

    const user = getUserFromToken(event);
    const addedBy = user ? (user.email || user.name || user.sub || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [result] = await connection.execute(
      `INSERT INTO ${TABLE} (year, queation_paper_url, added_by) VALUES (?, ?, ?)`,
      [year, queationPaperUrl || null, addedBy || null],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Previous year question paper created',
        id: result.insertId,
        queation_paper_url: queationPaperUrl || null,
      }),
    };
  } catch (error) {
    console.error('createPaper:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updatePaper = async (body, event) => {
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
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };
    }

    const row = existing[0];
    const year = data.year != null ? String(data.year).trim() : row.year;
    let queationPaperUrl = row.queation_paper_url;

    if (data.queation_paper_url != null) {
      queationPaperUrl = String(data.queation_paper_url).trim() || null;
    }

    if (data.queation_paper_base64) {
      if (row.queation_paper_url) await deleteObjectIfInOurBucket(row.queation_paper_url);
      queationPaperUrl = await uploadFileToS3({
        base64: data.queation_paper_base64,
        fileName: data.queation_paper_file_name,
        contentType: data.queation_paper_content_type || 'application/pdf',
      });
    }

    const user = getUserFromToken(event);
    const addedBy = user ? (user.email || user.name || user.sub || row.added_by) : row.added_by;

    await connection.execute(
      `UPDATE ${TABLE} SET year = ?, queation_paper_url = ?, added_by = ? WHERE id = ?`,
      [year, queationPaperUrl, addedBy || null, id],
    );

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Previous year question paper updated', id }) };
  } catch (error) {
    console.error('updatePaper:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deletePaper = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const id = data?.id != null ? parseInt(String(data.id), 10) : NaN;
    if (!Number.isFinite(id)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [existing] = await connection.execute(`SELECT queation_paper_url FROM ${TABLE} WHERE id = ? LIMIT 1`, [id]);
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };
    }

    const row = existing[0];
    await deleteObjectIfInOurBucket(row.queation_paper_url);
    await connection.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Previous year question paper deleted', id }) };
  } catch (error) {
    console.error('deletePaper:', error);
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
        return await getPapers(queryStringParameters);
      case 'POST':
        return await createPaper(parsedBody || body, event);
      case 'PUT':
        return await updatePaper(parsedBody || body, event);
      case 'DELETE':
        return await deletePaper(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('handler:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
