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
/** Test file buckets live in us-east-1 (LocationConstraint null); wrong region → 301 + browser CORS failure. */
const S3_BUCKET_REGION = 'us-east-1';

const BUCKET_QUESTIONS = 'clututor-onlinetest-queations';
const BUCKET_KEYANSWER = 'clututor-onlinetest-keyanswer';

const TABLE = 'addtest';

const s3TestBuckets = new AWS.S3({ region: S3_BUCKET_REGION, signatureVersion: 'v4' });

const publicObjectUrl = (bucket, key) => {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  if (S3_BUCKET_REGION === 'us-east-1') {
    return `https://${bucket}.s3.amazonaws.com/${encoded}`;
  }
  return `https://${bucket}.s3.${S3_BUCKET_REGION}.amazonaws.com/${encoded}`;
};

const isOurTestBucketHost = (host, bucket) =>
  host === `${bucket}.s3.amazonaws.com` ||
  host === `${bucket}.s3.${S3_BUCKET_REGION}.amazonaws.com` ||
  host.startsWith(`${bucket}.s3.`);

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
  await ensureColumn('test_kind', 'test_kind VARCHAR(32) NULL');
  await ensureColumn('test_category', 'test_category VARCHAR(64) NULL');
  await ensureColumn('isClose', 'isClose BOOL DEFAULT TRUE');
  await ensureColumn('isEnglish', 'isEnglish BOOL DEFAULT FALSE');
  await ensureColumn('isLogic', 'isLogic BOOL DEFAULT FALSE');
  await ensureColumn('isLegal', 'isLegal BOOL DEFAULT FALSE');
  await ensureColumn('isMath', 'isMath BOOL DEFAULT FALSE');
  await ensureColumn('isGK', 'isGK BOOL DEFAULT FALSE');
};

const BOOL_FLAG_COLUMNS = ['isClose', 'isEnglish', 'isLogic', 'isLegal', 'isMath', 'isGK'];

const TEST_SELECT_COLUMNS =
  'test_id, title, question_paper_url, answer_key_url, scheduled, selected_branch, added_by, created_at, test_kind, test_category, isClose, isEnglish, isLogic, isLegal, isMath, isGK';

const parseBoolInput = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
  return defaultValue;
};

const boolToDb = (value) => (parseBoolInput(value, false) ? 1 : 0);

const formatTestRow = (row) => {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  BOOL_FLAG_COLUMNS.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(out, col)) {
      out[col] = parseBoolInput(out[col], false);
    }
  });
  return out;
};

const readBoolFieldsFromBody = (data, useDefaults = true) => {
  const out = {};
  BOOL_FLAG_COLUMNS.forEach((col) => {
    if (data[col] !== undefined) {
      out[col] = boolToDb(data[col]);
    } else if (useDefaults) {
      out[col] = col === 'isClose' ? 1 : 0;
    }
  });
  return out;
};

const normalizeBase64Payload = (input) => {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const commaIndex = trimmed.indexOf(',');
  return commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
};

const isZipDocxBuffer = (buf) =>
  buf && buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

const isOleDocBuffer = (buf) =>
  buf && buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;

const assertValidAnswerKeyBuffer = (buf, fileName) => {
  if (!buf || !buf.length) throw new Error('Answer key file is empty');
  const lower = String(fileName || '').toLowerCase();
  if (isOleDocBuffer(buf)) {
    throw new Error('Answer key is legacy Word .doc. Re-save as .docx in Word and upload again.');
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc') || (lower.includes('answer') && lower.includes('key'))) {
    if (!isZipDocxBuffer(buf)) {
      throw new Error('Answer key is not a valid Word .docx document. Re-save as .docx and upload again.');
    }
  }
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
  if (bucket === BUCKET_KEYANSWER) assertValidAnswerKeyBuffer(buf, fileName);

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${keyPrefix}${Date.now()}-${safeName}`;

  await s3TestBuckets
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: String(contentType).trim(),
    })
    .promise();

  return publicObjectUrl(bucket, key);
};

const presignAddTestUpload = async (body) => {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const fileRole = data?.file_role != null ? String(data.file_role).trim() : '';
    const fileName = data?.file_name != null ? String(data.file_name).trim() : '';
    const contentType = data?.content_type != null ? String(data.content_type).trim() : '';

    if (!fileRole || !fileName || !contentType) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'file_role, file_name, and content_type are required' }),
      };
    }

    const isAnswerKey = fileRole === 'answer_key';
    const bucket = isAnswerKey ? BUCKET_KEYANSWER : BUCKET_QUESTIONS;
    const keyPrefix = isAnswerKey ? 'answer-keys/' : 'question-papers/';
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${keyPrefix}${Date.now()}-${safeName}`;

    const uploadUrl = await s3TestBuckets.getSignedUrlPromise('putObject', {
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Expires: 300,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        upload_url: uploadUrl,
        object_url: publicObjectUrl(bucket, key),
        key,
        bucket,
      }),
    };
  } catch (error) {
    console.error('presignAddTestUpload:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to generate upload URL', error: error.message }),
    };
  }
};

const deleteObjectIfInOurBuckets = async (url) => {
  if (!url || typeof url !== 'string') return;
  let bucket = null;
  let key = null;
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (isOurTestBucketHost(host, BUCKET_QUESTIONS)) {
      bucket = BUCKET_QUESTIONS;
    } else if (isOurTestBucketHost(host, BUCKET_KEYANSWER)) {
      bucket = BUCKET_KEYANSWER;
    }
    if (!bucket) return;
    key = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!key) return;
    await s3TestBuckets.deleteObject({ Bucket: bucket, Key: key }).promise();
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
    if (isOurTestBucketHost(host, BUCKET_QUESTIONS)) {
      bucket = BUCKET_QUESTIONS;
    } else if (isOurTestBucketHost(host, BUCKET_KEYANSWER)) {
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

/** Presigned GET URL — avoids API Gateway 502 when proxying large docx/pdf as base64. */
const presignTestFileDownload = async ({ bucket, key, contentType, fileName }) => {
  const safeName = String(fileName || 'file').replace(/[^\w.\-()+ ]/g, '_');
  const ct = String(contentType || 'application/octet-stream').trim();
  const downloadUrl = await s3TestBuckets.getSignedUrlPromise('getObject', {
    Bucket: bucket,
    Key: key,
    Expires: 300,
    ResponseContentType: ct,
    ResponseContentDisposition: `inline; filename="${safeName}"`,
  });
  return {
    download_url: downloadUrl,
    content_type: ct,
    file_name: safeName,
  };
};

const guessContentTypeFromKey = (key, fallback) => {
  const lower = String(key || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  return fallback || 'application/octet-stream';
};

/**
 * Student / browser-safe download: returns presigned S3 URL (small JSON — no 502 on large files).
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
    const fileName = bk.key ? String(bk.key).split('/').pop() : 'question-paper';
    const signed = await presignTestFileDownload({
      bucket: bk.bucket,
      key: bk.key,
      contentType: guessContentTypeFromKey(bk.key),
      fileName,
    });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        test_id: rows[0].test_id,
        title: rows[0].title,
        ...signed,
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
 * Browser-safe answer-key download payload (presigned URL).
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
    const fileName = bk.key ? String(bk.key).split('/').pop() : 'answer-key';
    const signed = await presignTestFileDownload({
      bucket: bk.bucket,
      key: bk.key,
      contentType: guessContentTypeFromKey(bk.key),
      fileName,
    });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        test_id: rows[0].test_id,
        title: rows[0].title,
        ...signed,
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
        `SELECT ${TEST_SELECT_COLUMNS} FROM ${TABLE} WHERE test_id = ? LIMIT 1`,
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
        body: JSON.stringify(formatTestRow(rows[0])),
      };
    }

    const [rows] = await connection.execute(
      `SELECT ${TEST_SELECT_COLUMNS} FROM ${TABLE} ORDER BY created_at DESC`,
    );
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(rows.map(formatTestRow)),
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
    const testKind = data.test_kind != null ? String(data.test_kind).trim().slice(0, 32) : null;
    const testCategory = data.test_category != null ? String(data.test_category).trim().slice(0, 64) : null;
    const boolFields = readBoolFieldsFromBody(data, true);

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
      `INSERT INTO ${TABLE} (title, question_paper_url, answer_key_url, scheduled, selected_branch, added_by, test_kind, test_category, isClose, isEnglish, isLogic, isLegal, isMath, isGK)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        questionPaperUrl || null,
        answerKeyUrl || null,
        scheduled,
        selectedBranch != null ? stringifyBranchForDb(selectedBranch) : null,
        addedBy || null,
        testKind || null,
        testCategory || null,
        boolFields.isClose,
        boolFields.isEnglish,
        boolFields.isLogic,
        boolFields.isLegal,
        boolFields.isMath,
        boolFields.isGK,
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

    let testKind = row.test_kind;
    if (data.test_kind !== undefined) {
      testKind = data.test_kind != null ? String(data.test_kind).trim().slice(0, 32) : null;
    }

    let testCategory = row.test_category;
    if (data.test_category !== undefined) {
      testCategory = data.test_category != null ? String(data.test_category).trim().slice(0, 64) : null;
    }

    const user = getUserFromToken(event);
    const addedBy = user ? (user.email || user.name || user.sub || row.added_by) : row.added_by;

    const updateFields = [
      'title = ?',
      'question_paper_url = ?',
      'answer_key_url = ?',
      'scheduled = ?',
      'selected_branch = ?',
      'added_by = ?',
      'test_kind = ?',
      'test_category = ?',
    ];
    const updateParams = [
      title,
      questionPaperUrl,
      answerKeyUrl,
      scheduled,
      selectedBranch != null ? stringifyBranchForDb(selectedBranch) : null,
      addedBy || null,
      testKind || null,
      testCategory || null,
    ];

    BOOL_FLAG_COLUMNS.forEach((col) => {
      if (data[col] !== undefined) {
        updateFields.push(`${col} = ?`);
        updateParams.push(boolToDb(data[col]));
      }
    });

    updateParams.push(testId);

    await connection.execute(
      `UPDATE ${TABLE} SET ${updateFields.join(', ')} WHERE test_id = ?`,
      updateParams,
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
        if (parsedBody && parsedBody.action === 'presign_upload') {
          return await presignAddTestUpload(parsedBody);
        }
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
