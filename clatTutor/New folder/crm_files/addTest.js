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

const BUCKET_QUESTIONS = 'clututor-onlinetest-queations';
const BUCKET_KEYANSWER = 'clututor-onlinetest-keyanswer';

const TABLE = 'addtest';

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

const ensureAddTestSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      test_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(1000),
      question_paper_url VARCHAR(1000),
      answer_key_url VARCHAR(1000),
      scheduled DATE NULL,
      selected_branch JSON,
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

  await ensureColumn('title', 'title VARCHAR(1000)');
  await ensureColumn('question_paper_url', 'question_paper_url VARCHAR(1000)');
  await ensureColumn('answer_key_url', 'answer_key_url VARCHAR(1000)');
  await ensureColumn('scheduled', 'scheduled DATE NULL');
  await ensureColumn('selected_branch', 'selected_branch JSON');
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

const uploadFileToS3 = async ({ base64, fileName, contentType, bucket, keyPrefix }) => {
  if (!base64) return null;
  if (!fileName || !contentType) {
    throw new Error('file_name and content_type are required when uploading a file');
  }
  const raw = normalizeBase64Payload(String(base64));
  if (!raw) throw new Error('file base64 is empty or invalid');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) throw new Error('Unable to decode file base64');

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${keyPrefix}${Date.now()}-${safeName}`;

  await s3
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: String(contentType).trim(),
    })
    .promise();

  return publicObjectUrl(bucket, key);
};

const deleteObjectIfInOurBuckets = async (url) => {
  if (!url || typeof url !== 'string') return;
  let bucket = null;
  let key = null;
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === `${BUCKET_QUESTIONS}.s3.${AWS_REGION}.amazonaws.com` || host.startsWith(`${BUCKET_QUESTIONS}.s3.`)) {
      bucket = BUCKET_QUESTIONS;
    } else if (host === `${BUCKET_KEYANSWER}.s3.${AWS_REGION}.amazonaws.com` || host.startsWith(`${BUCKET_KEYANSWER}.s3.`)) {
      bucket = BUCKET_KEYANSWER;
    }
    if (!bucket) return;
    key = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!key) return;
    await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
  } catch (e) {
    console.warn('S3 delete skipped:', e.message);
  }
};

/** Parse our public S3 URL into bucket + key (same rules as deleteObjectIfInOurBuckets). */
const parseOurS3BucketKeyFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const host = u.hostname;
    let bucket = null;
    if (host === `${BUCKET_QUESTIONS}.s3.${AWS_REGION}.amazonaws.com` || host.startsWith(`${BUCKET_QUESTIONS}.s3.`)) {
      bucket = BUCKET_QUESTIONS;
    } else if (host === `${BUCKET_KEYANSWER}.s3.${AWS_REGION}.amazonaws.com` || host.startsWith(`${BUCKET_KEYANSWER}.s3.`)) {
      bucket = BUCKET_KEYANSWER;
    }
    if (!bucket) return null;
    const key = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!key) return null;
    return { bucket, key };
  } catch {
    return null;
  }
};

/**
 * Student / browser-safe download: S3 has no CORS for localhost. Lambda reads the object and returns base64 JSON.
 * GET ?test_id=N&paper=1
 */
const getQuestionPaperPayload = async (testId) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureAddTestSchema(connection);
    const [rows] = await connection.execute(
      `SELECT test_id, title, question_paper_url FROM ${TABLE} WHERE test_id = ? LIMIT 1`,
      [testId],
    );
    if (!rows.length) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Not found' }),
      };
    }
    const paperUrl = rows[0].question_paper_url;
    if (!paperUrl || !String(paperUrl).trim()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No question paper for this test' }),
      };
    }
    const bk = parseOurS3BucketKeyFromUrl(paperUrl);
    if (!bk || bk.bucket !== BUCKET_QUESTIONS) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Question paper must be stored in the institute questions bucket' }),
      };
    }
    const obj = await s3.getObject({ Bucket: bk.bucket, Key: bk.key }).promise();
    const rawBody = obj.Body;
    if (!rawBody) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'File not found in storage' }),
      };
    }
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const contentType =
      obj.ContentType ||
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        test_id: rows[0].test_id,
        title: rows[0].title,
        content_base64: buf.toString('base64'),
        content_type: contentType,
        file_name: bk && bk.key ? String(bk.key).split('/').pop() : 'question-paper',
      }),
    };
  } catch (error) {
    console.error('getQuestionPaperPayload:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) try { connection.release(); } catch (_) {}
  }
};

/**
 * Browser-safe answer-key download payload.
 * GET ?test_id=N&answer=1
 */
const getAnswerKeyPayload = async (testId) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureAddTestSchema(connection);
    const [rows] = await connection.execute(
      `SELECT test_id, title, answer_key_url FROM ${TABLE} WHERE test_id = ? LIMIT 1`,
      [testId],
    );
    if (!rows.length) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Not found' }),
      };
    }
    const answerUrl = rows[0].answer_key_url;
    if (!answerUrl || !String(answerUrl).trim()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No answer key for this test' }),
      };
    }
    const bk = parseOurS3BucketKeyFromUrl(answerUrl);
    if (!bk || bk.bucket !== BUCKET_KEYANSWER) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Answer key must be stored in the institute answer-key bucket' }),
      };
    }
    const obj = await s3.getObject({ Bucket: bk.bucket, Key: bk.key }).promise();
    const rawBody = obj.Body;
    if (!rawBody) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'File not found in storage' }),
      };
    }
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const contentType =
      obj.ContentType ||
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        test_id: rows[0].test_id,
        title: rows[0].title,
        content_base64: buf.toString('base64'),
        content_type: contentType,
        file_name: bk && bk.key ? String(bk.key).split('/').pop() : 'answer-key',
      }),
    };
  } catch (error) {
    console.error('getAnswerKeyPayload:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) try { connection.release(); } catch (_) {}
  }
};

const parseSelectedBranch = (raw) => {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
};

const stringifyBranchForDb = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const getAddTests = async (queryStringParameters) => {
  const params = queryStringParameters || {};
  const testIdRaw = params.test_id != null ? params.test_id : params.id;
  const wantsPaper =
    params.paper === '1' ||
    params.paper === 'true' ||
    String(params.paper || '').toLowerCase() === 'yes';
  const wantsAnswer =
    params.answer === '1' ||
    params.answer === 'true' ||
    String(params.answer || '').toLowerCase() === 'yes';

  if (testIdRaw != null && wantsPaper) {
    const tid = parseInt(String(testIdRaw), 10);
    if (!Number.isFinite(tid)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid test_id' }),
      };
    }
    return getQuestionPaperPayload(tid);
  }
  if (testIdRaw != null && wantsAnswer) {
    const tid = parseInt(String(testIdRaw), 10);
    if (!Number.isFinite(tid)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid test_id' }),
      };
    }
    return getAnswerKeyPayload(tid);
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await ensureAddTestSchema(connection);
    const testId = testIdRaw;

    if (testId != null) {
      const [rows] = await connection.execute(
        `SELECT test_id, title, question_paper_url, answer_key_url, scheduled, selected_branch, added_by, created_at
         FROM ${TABLE} WHERE test_id = ? LIMIT 1`,
        [parseInt(String(testId), 10)],
      );
      if (!rows.length) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Not found' }),
        };
      }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(rows[0]),
      };
    }

    const [rows] = await connection.execute(
      `SELECT test_id, title, question_paper_url, answer_key_url, scheduled, selected_branch, added_by, created_at
       FROM ${TABLE} ORDER BY created_at DESC`,
    );
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(rows),
    };
  } catch (error) {
    console.error('getAddTests:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) try { connection.release(); } catch (_) {}
  }
};

const createAddTest = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const title = data.title != null ? String(data.title).trim() : '';
    if (!title) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'title is required' }) };
    }

    const scheduledRaw = data.scheduled != null ? String(data.scheduled).trim() : '';
    let scheduled = null;
    if (scheduledRaw) {
      const d = new Date(scheduledRaw);
      if (Number.isNaN(d.getTime())) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'scheduled must be a valid date' }) };
      }
      scheduled = scheduledRaw.slice(0, 10);
    }

    const selectedBranch = parseSelectedBranch(data.selected_branch);

    const user = getUserFromToken(event);
    const addedBy = user ? (user.email || user.name || user.sub || null) : (data.added_by != null ? String(data.added_by).trim() : null);

    let questionPaperUrl = data.question_paper_url != null ? String(data.question_paper_url).trim() : null;
    let answerKeyUrl = data.answer_key_url != null ? String(data.answer_key_url).trim() : null;

    if (data.question_paper_base64) {
      questionPaperUrl = await uploadFileToS3({
        base64: data.question_paper_base64,
        fileName: data.question_paper_file_name,
        contentType: data.question_paper_content_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bucket: BUCKET_QUESTIONS,
        keyPrefix: 'question-papers/',
      });
    }
    if (data.answer_key_base64) {
      answerKeyUrl = await uploadFileToS3({
        base64: data.answer_key_base64,
        fileName: data.answer_key_file_name,
        contentType: data.answer_key_content_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bucket: BUCKET_KEYANSWER,
        keyPrefix: 'answer-keys/',
      });
    }

    connection = await pool.getConnection();
    await ensureAddTestSchema(connection);

    const [result] = await connection.execute(
      `INSERT INTO ${TABLE} (title, question_paper_url, answer_key_url, scheduled, selected_branch, added_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        title,
        questionPaperUrl || null,
        answerKeyUrl || null,
        scheduled,
        selectedBranch != null ? stringifyBranchForDb(selectedBranch) : null,
        addedBy || null,
      ],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Test created',
        test_id: result.insertId,
        question_paper_url: questionPaperUrl || null,
        answer_key_url: answerKeyUrl || null,
      }),
    };
  } catch (error) {
    console.error('createAddTest:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) try { connection.release(); } catch (_) {}
  }
};

const updateAddTest = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const testId = data?.test_id != null ? parseInt(String(data.test_id), 10) : NaN;
    if (!Number.isFinite(testId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'test_id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureAddTestSchema(connection);

    const [existing] = await connection.execute(`SELECT * FROM ${TABLE} WHERE test_id = ? LIMIT 1`, [testId]);
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };
    }

    const row = existing[0];
    let questionPaperUrl = row.question_paper_url;
    let answerKeyUrl = row.answer_key_url;

    if (data.question_paper_url != null) questionPaperUrl = String(data.question_paper_url).trim() || null;
    if (data.answer_key_url != null) answerKeyUrl = String(data.answer_key_url).trim() || null;

    if (data.question_paper_base64) {
      if (row.question_paper_url) await deleteObjectIfInOurBuckets(row.question_paper_url);
      questionPaperUrl = await uploadFileToS3({
        base64: data.question_paper_base64,
        fileName: data.question_paper_file_name,
        contentType: data.question_paper_content_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bucket: BUCKET_QUESTIONS,
        keyPrefix: 'question-papers/',
      });
    }
    if (data.answer_key_base64) {
      if (row.answer_key_url) await deleteObjectIfInOurBuckets(row.answer_key_url);
      answerKeyUrl = await uploadFileToS3({
        base64: data.answer_key_base64,
        fileName: data.answer_key_file_name,
        contentType: data.answer_key_content_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bucket: BUCKET_KEYANSWER,
        keyPrefix: 'answer-keys/',
      });
    }

    const title = data.title != null ? String(data.title).trim() : row.title;
    let scheduled = row.scheduled;
    if (data.scheduled !== undefined) {
      const s = data.scheduled != null ? String(data.scheduled).trim() : '';
      scheduled = s ? s.slice(0, 10) : null;
    }

    let selectedBranch = row.selected_branch;
    if (data.selected_branch !== undefined) {
      selectedBranch = parseSelectedBranch(data.selected_branch);
    }

    const user = getUserFromToken(event);
    const addedBy = user ? (user.email || user.name || user.sub || row.added_by) : row.added_by;

    await connection.execute(
      `UPDATE ${TABLE} SET title = ?, question_paper_url = ?, answer_key_url = ?, scheduled = ?, selected_branch = ?, added_by = ?
       WHERE test_id = ?`,
      [
        title,
        questionPaperUrl,
        answerKeyUrl,
        scheduled,
        selectedBranch != null ? stringifyBranchForDb(selectedBranch) : null,
        addedBy || null,
        testId,
      ],
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Test updated', test_id: testId }),
    };
  } catch (error) {
    console.error('updateAddTest:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) try { connection.release(); } catch (_) {}
  }
};

const deleteAddTest = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const testId = data?.test_id != null ? parseInt(String(data.test_id), 10) : NaN;
    if (!Number.isFinite(testId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'test_id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureAddTestSchema(connection);

    const [existing] = await connection.execute(
      `SELECT question_paper_url, answer_key_url FROM ${TABLE} WHERE test_id = ? LIMIT 1`,
      [testId],
    );
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Not found' }) };
    }

    const row = existing[0];
    await deleteObjectIfInOurBuckets(row.question_paper_url);
    await deleteObjectIfInOurBuckets(row.answer_key_url);

    await connection.execute(`DELETE FROM ${TABLE} WHERE test_id = ?`, [testId]);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Test deleted', test_id: testId }),
    };
  } catch (error) {
    console.error('deleteAddTest:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) try { connection.release(); } catch (_) {}
  }
};

export const handler = async (event) => {
  const { httpMethod, body } = event;

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
        return await getAddTests(event.queryStringParameters);
      case 'POST':
        return await createAddTest(parsedBody || body, event);
      case 'PUT':
        return await updateAddTest(parsedBody || body, event);
      case 'DELETE':
        return await deleteAddTest(parsedBody || body);
      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }
  } catch (error) {
    console.error('handler:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
