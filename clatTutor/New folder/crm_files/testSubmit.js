import { pool } from './db.js';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';
import mammoth from 'mammoth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const JWT_SECRET = process.env.JWT_SECRET;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
/** Test file buckets live in us-east-1 (same as addTest.js); wrong region breaks S3 getObject. */
const S3_BUCKET_REGION = 'us-east-1';

const BUCKET_QUESTIONS = 'clututor-onlinetest-queations';
const BUCKET_KEYANSWER = 'clututor-onlinetest-keyanswer';

const TABLE_ADDTEST = 'addtest';
const TABLE_SUBMITTED = 'submitted_online_test';

const STUDENT_GENERAL_INFO_URL =
  'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info';

const s3TestBuckets = new AWS.S3({ region: S3_BUCKET_REGION, signatureVersion: 'v4' });

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

/**
 * Same answer-key parsing rules as crm/addTest.html (parseAnswerKeyText + helpers).
 */
function normalizeAnswerKeyQuotes(s) {
  return String(s || '')
    .replace(/\u201c|\u201d|\u00ab|\u00bb/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

function extractCorrectOptionLetter(tail) {
  const t = normalizeAnswerKeyQuotes(tail).replace(/\t/g, ' ');
  const block = t.split(/\bSolution\s*:/i)[0].split(/\bReason\s*:/i)[0];
  const blockTrim = (block || t).trim();
  const lm =
    blockTrim.match(/Correct\s+Option\s+is\s*:\s*["']?\s*([A-D])\s*["']?/i) ||
    blockTrim.match(/Correct\s+option\s+is\s*:\s*["']?\s*([A-D])\b/i) ||
    blockTrim.match(/Correct\s+option\s*:\s*["']?\s*([A-D])\b/i) ||
    blockTrim.match(/Correct\s+Answer\s*:\s*["']?\s*([A-D])\s*[\)"']?/i) ||
    blockTrim.match(/Correct\s+Answer\s*:\s*["']?\s*([A-D])\b/i) ||
    blockTrim.match(/Ans\s*[:\-\u2013\u2014]\s*\(?\s*([A-D])\s*\)?/i) ||
    blockTrim.match(/Ans\s*:\s*([A-D])\b/i) ||
    blockTrim.match(/Answer\s*:\s*([A-D])\b/i) ||
    blockTrim.match(/["']([A-D])["']/) ||
    blockTrim.match(/^\s*["']?([A-D])["']?\s*$/i);
  return lm ? lm[1].toUpperCase() : null;
}

function normalizeAnswerKeyLayout(text) {
  let s = String(text || '').replace(/\r\n?/g, '\n');
  s = normalizeAnswerKeyQuotes(s);
  s = s.replace(/\t/g, ' ');
  s = s.replace(
    /(^|\n)(\d{1,3})\s*\.\s*Answer\s*:\s*(?:\n\s*)+((?:Correct\s+option\s+is)\s*:[^\n]+)/gi,
    (_, lb, n, co) => lb + n + '.Answer: ' + co.trim(),
  );
  s = s.replace(
    /(^|\n)(\d{1,3})Answer\s*:\s*(?:\n\s*)+((?:Correct\s+option\s+is)\s*:[^\n]+)/gi,
    (_, lb, n, co) => lb + n + 'Answer: ' + co.trim(),
  );
  s = s.replace(/^(\d{1,3})\s*\.?\s*\n\s*Answer\s*:\s*(.*)$/gim, '$1.Answer: $2');
  s = s.replace(/([^\n])\n(\d{1,3})\s*\.?\s*\n\s*Answer\s*:\s*([^\n]*)/gi, '$1\n$2.Answer: $3');
  s = s.replace(/(^|\n)(LR|LE|AR|GK|RC|QA)(?=(\d{1,3})\s*\.\s*Answer\s*:)/gi, '$1$2\n');
  s = s.replace(/(?<!\d)(?=(\d{1,3})\s*\.\s*Answer\s*:)/gi, '\n');
  s = s.replace(/(?<!\d)(?=([0-9]{1,3})Answer\s*:)/gi, '\n');
  s = s.replace(/(?<!\d)(?=(\d{1,3})\s*\.\s*[A-Da-d]\b)/gi, '\n');
  return s;
}

function parseAnswerKeyText(text) {
  const map = Object.create(null);
  const lines = normalizeAnswerKeyLayout(text).split('\n');
  let i = 0;

  const isSectionHeader = (t) =>
    /^(LR|LE|AR|GK|RC|QA)$/i.test(t) ||
    /^\([^)]+\)\s*$/i.test(t) ||
    /^\[[^\]]+\]\s*$/i.test(t) ||
    /^(English|General Knowledge|Legal Reasoning|Logical Reasoning|Quantitative techniques)\b/i.test(t);

  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) {
      i++;
      continue;
    }
    if (isSectionHeader(t)) {
      i++;
      continue;
    }

    const am =
      t.match(/^(\d+)\s*\.\s*Answer\s*:\s*(.*)$/i) || t.match(/^(\d+)Answer\s*:\s*(.*)$/i);
    if (am) {
      const qn = parseInt(am[1], 10);
      if (qn < 1 || qn > 199) {
        i++;
        continue;
      }
      const tail = normalizeAnswerKeyQuotes((am[2] || '').trim());
      const letter = extractCorrectOptionLetter(tail);
      const solParts = [];
      i++;
      while (i < lines.length) {
        const nt = lines[i].trim();
        if (!nt) {
          i++;
          continue;
        }
        if (/^(\d+)\s*\.\s*Answer\s*:/i.test(nt) || /^(\d+)Answer\s*:/i.test(nt)) break;
        if (/^(\d+)\s*[\.\)]\s*[A-Da-d]\b/.test(nt)) break;
        if (/^(\d+)\s+[A-Da-d]\b/.test(nt)) break;
        if (isSectionHeader(nt)) break;
        if (/^\s*(?:Solution|Reason)\s*:/i.test(lines[i])) {
          solParts.push(lines[i].replace(/^\s*(?:Solution|Reason)\s*:\s*/i, '').trim());
        } else {
          solParts.push(nt);
        }
        i++;
      }
      if (letter) {
        map[qn] = { letter, solution: solParts.join('\n').trim() };
      }
      continue;
    }

    const smLine = lines[i];
    const sm =
      smLine.match(/^\s*(\d{1,3})\s*[\.\)]\s*([A-Da-d])\b/) ||
      smLine.match(/^\s*(\d{1,3})\s+([A-Da-d])\b/);
    if (sm) {
      const qnSm = parseInt(sm[1], 10);
      if (qnSm < 1 || qnSm > 199) {
        i++;
        continue;
      }
      const letterSm = sm[2].toUpperCase();
      i++;
      while (i < lines.length) {
        const ntSm = lines[i].trim();
        if (!ntSm) {
          i++;
          continue;
        }
        if (/^(\d+)\s*\.\s*Answer\s*:/i.test(ntSm) || /^(\d+)Answer\s*:/i.test(ntSm)) break;
        if (/^\s*(\d{1,3})\s*[\.\)]\s*[A-Da-d]\b/.test(lines[i]) || /^\s*(\d{1,3})\s+[A-Da-d]\b/.test(lines[i])) {
          break;
        }
        if (isSectionHeader(ntSm)) break;
        i++;
      }
      map[qnSm] = { letter: letterSm, solution: '' };
      continue;
    }

    const loose = t.match(/(?:question|q)\s*\.?\s*(\d+)\s*[:.\)]\s*([A-Da-d])\b/i);
    if (loose) {
      const qL = parseInt(loose[1], 10);
      if (qL >= 1 && qL <= 199) {
        map[qL] = { letter: loose[2].toUpperCase(), solution: '' };
      }
      i++;
      continue;
    }

    i++;
  }

  const cleaned = Object.create(null);
  Object.keys(map).forEach((k) => {
    const nk = parseInt(k, 10);
    if (nk >= 1 && nk <= 199) cleaned[k] = map[k];
  });
  return cleaned;
}

function getAnswerLetter(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry;
  return entry.letter || '';
}

const ensureSubmittedSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_SUBMITTED} (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      test_id BIGINT,
      title VARCHAR(1000),
      student_name VARCHAR(100),
      batch VARCHAR(100),
      branch VARCHAR(50),
      answers JSON,
      submitted_by VARCHAR(50),
      attended_queations BIGINT,
      correctAnswer BIGINT,
      totalgrade VARCHAR(30),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const ensureSubmittedExtraColumns = async (connection) => {
  const ensureColumn = async (columnName, ddl) => {
    const [rows] = await connection.execute(
      `
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
      `,
      [TABLE_SUBMITTED, columnName],
    );
    if (Array.isArray(rows) && rows[0] && Number(rows[0].cnt) === 0) {
      await connection.execute(`ALTER TABLE ${TABLE_SUBMITTED} ADD COLUMN ${ddl}`);
    }
  };

  await ensureColumn('percentage', 'percentage DECIMAL(6,2) NULL');
  await ensureColumn('unanswered_questions', 'unanswered_questions INT NULL');
  await ensureColumn('total_questions_paper', 'total_questions_paper INT NULL');
  await ensureColumn('total_questions_in_key', 'total_questions_in_key INT NULL');
  await ensureColumn('letter_grade', 'letter_grade VARCHAR(10) NULL');
  await ensureColumn('isOmr', 'isOmr TINYINT(1) NOT NULL DEFAULT 0');
};

const ensureAddTestSchemaMinimal = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_ADDTEST} (
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
};

async function fetchStudentFromGeneralInfo(studentId, email) {
  const res = await fetch(STUDENT_GENERAL_INFO_URL, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`student_general_info HTTP ${res.status}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return null;
  const sid = studentId != null ? String(studentId).trim() : '';
  const em = email != null ? String(email).trim().toLowerCase() : '';
  return (
    rows.find((s) => {
      if (sid && String(s.student_id) === sid) return true;
      if (em && String(s.email || '').toLowerCase() === em) return true;
      return false;
    }) || null
  );
}

async function getAnswerKeyTextFromUrl(answerKeyUrl) {
  const bk = parseOurS3BucketKeyFromUrl(answerKeyUrl);
  if (!bk || bk.bucket !== BUCKET_KEYANSWER) {
    throw new Error('Answer key must be in the institute answer-key bucket');
  }
  const obj = await s3TestBuckets.getObject({ Bucket: bk.bucket, Key: bk.key }).promise();
  const rawBody = obj.Body;
  if (!rawBody) return '';
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const lower = bk.key.toLowerCase();
  /* Node.js: mammoth expects { buffer }, not { arrayBuffer } (browser API). Wrong option → "Could not find file in options". */
  if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result && result.value) || '';
  }
  if (lower.endsWith('.doc')) {
    throw new Error('Answer key must be .docx (Word 2007+), not legacy .doc');
  }
  return buf.toString('utf8');
}

function letterGrade(pct) {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

function evaluateAnswers(answerKeyMap, studentAnswers) {
  const keyNums = Object.keys(answerKeyMap).map((k) => parseInt(k, 10)).filter((n) => n >= 1 && n <= 199);
  const totalInKey = keyNums.length;

  let attended = 0;
  let correct = 0;

  const sa = studentAnswers && typeof studentAnswers === 'object' ? studentAnswers : {};

  for (const k of Object.keys(sa)) {
    const letter = String(sa[k] || '').trim().toUpperCase();
    if (letter && /^[A-D]$/.test(letter)) attended++;
  }

  for (const num of keyNums) {
    const keyLetter = getAnswerLetter(answerKeyMap[num]).toUpperCase();
    const st = String(sa[String(num)] || sa[num] || '').trim().toUpperCase();
    if (st && /^[A-D]$/.test(st) && keyLetter && st === keyLetter) {
      correct++;
    }
  }

  const pct = totalInKey > 0 ? Math.round((correct / totalInKey) * 1000) / 10 : 0;
  const lg = totalInKey > 0 ? letterGrade(pct) : '';
  const grade = totalInKey > 0 ? `${pct}% (${lg})` : 'N/A';

  return {
    attendedQuestions: attended,
    correctAnswer: correct,
    totalQuestionsInKey: totalInKey,
    percentage: pct,
    letterGrade: lg,
    totalgrade: grade,
  };
}

const submitOnlineTest = async (body, event) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid JSON body' }) };
    }

    const testId = data.test_id != null ? parseInt(String(data.test_id), 10) : NaN;
    if (!Number.isFinite(testId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'test_id is required' }) };
    }

    const answers = data.answers;
    if (answers == null || typeof answers !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'answers object is required' }) };
    }

    const studentId = data.student_id != null ? data.student_id : null;
    const emailFromClient = data.email != null ? String(data.email).trim() : '';

    const jwtUser = getUserFromToken(event);
    let submittedBy =
      jwtUser && (jwtUser.email || jwtUser.name || jwtUser.sub)
        ? String(jwtUser.email || jwtUser.name || jwtUser.sub).slice(0, 50)
        : '';

    connection = await pool.getConnection();
    await ensureSubmittedSchema(connection);
    await ensureSubmittedExtraColumns(connection);
    await ensureAddTestSchemaMinimal(connection);

    const [testRows] = await connection.execute(
      `SELECT test_id, title, answer_key_url FROM ${TABLE_ADDTEST} WHERE test_id = ? LIMIT 1`,
      [testId],
    );
    if (!testRows.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Test not found' }) };
    }

    const testRow = testRows[0];
    const title = testRow.title != null ? String(testRow.title).trim() : '';
    const answerKeyUrl = testRow.answer_key_url;

    let studentRow = null;
    try {
      studentRow = await fetchStudentFromGeneralInfo(studentId, emailFromClient);
    } catch (e) {
      console.error('fetchStudentFromGeneralInfo:', e);
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Unable to load student profile', error: e.message }),
      };
    }

    if (!studentRow) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Student not found for student_id / email' }),
      };
    }

    const studentName = String(studentRow.name || '').trim().slice(0, 100);
    const batch = studentRow.batch != null ? String(studentRow.batch).slice(0, 100) : '';
    const branch = studentRow.branch != null ? String(studentRow.branch).slice(0, 50) : '';

    if (!submittedBy) {
      submittedBy = String(studentRow.email || emailFromClient || '').slice(0, 50);
    }

    const rawIsOmr = data.isOmr != null ? data.isOmr : data.is_omr;
    const isOmr =
      rawIsOmr === true ||
      rawIsOmr === 1 ||
      String(rawIsOmr || '')
        .trim()
        .toLowerCase() === 'true'
        ? 1
        : 0;

    let keyMap = {};
    if (answerKeyUrl && String(answerKeyUrl).trim()) {
      try {
        const keyText = await getAnswerKeyTextFromUrl(answerKeyUrl);
        keyMap = parseAnswerKeyText(keyText);
      } catch (e) {
        console.error('Answer key parse:', e);
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Could not read answer key file', error: e.message }),
        };
      }
    }

    const evalResult = evaluateAnswers(keyMap, answers);

    const paperTotalRaw = data.total_questions != null ? parseInt(String(data.total_questions), 10) : NaN;
    const paperTotalOk = Number.isFinite(paperTotalRaw) && paperTotalRaw >= 0;
    const paperTotal = paperTotalOk ? paperTotalRaw : null;
    const unansweredPaper =
      paperTotal != null ? Math.max(0, paperTotal - evalResult.attendedQuestions) : null;

    const [insertResult] = await connection.execute(
      `INSERT INTO ${TABLE_SUBMITTED}
       (test_id, title, student_name, batch, branch, answers, submitted_by, attended_queations, correctAnswer, totalgrade,
        percentage, unanswered_questions, total_questions_paper, total_questions_in_key, letter_grade, isOmr)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testId,
        title,
        studentName,
        batch,
        branch,
        JSON.stringify(answers),
        submittedBy,
        evalResult.attendedQuestions,
        evalResult.correctAnswer,
        evalResult.totalgrade,
        evalResult.totalQuestionsInKey > 0 ? evalResult.percentage : null,
        unansweredPaper,
        paperTotal,
        evalResult.totalQuestionsInKey > 0 ? evalResult.totalQuestionsInKey : null,
        evalResult.letterGrade || null,
        isOmr,
      ],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Test submitted',
        id: insertResult.insertId,
        test_id: testId,
        title,
        student_name: studentName,
        batch,
        branch,
        attended_queations: evalResult.attendedQuestions,
        answered_questions: evalResult.attendedQuestions,
        unanswered_questions: unansweredPaper,
        correctAnswer: evalResult.correctAnswer,
        total_questions_in_key: evalResult.totalQuestionsInKey,
        total_questions_paper: paperTotal,
        percentage: evalResult.percentage,
        letter_grade: evalResult.letterGrade,
        totalgrade: evalResult.totalgrade,
        submitted_by: submittedBy,
        isOmr: isOmr === 1,
      }),
    };
  } catch (error) {
    console.error('submitOnlineTest:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) try { connection.release(); } catch (_) {}
  }
};

const listStudentAttempts = async (event) => {
  const qs = event.queryStringParameters || {};
  if ((qs.action || '').trim() !== 'student_attempts') {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid action' }) };
  }
  const email = (qs.email || '').trim();
  if (!email) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'email is required' }) };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSubmittedSchema(connection);
    await ensureSubmittedExtraColumns(connection);

    const [rows] = await connection.execute(
      `SELECT test_id, title, percentage, letter_grade, totalgrade, total_questions_paper, answers, created_at, isOmr
       FROM ${TABLE_SUBMITTED}
       WHERE LOWER(TRIM(submitted_by)) = LOWER(TRIM(?))
       ORDER BY created_at DESC`,
      [email],
    );

    const latestByTest = {};
    for (const r of rows) {
      const tid = r.test_id;
      if (tid == null) continue;
      if (!latestByTest[tid]) latestByTest[tid] = r;
    }

    const attempts = Object.keys(latestByTest).map((tidKey) => {
      const r = latestByTest[tidKey];
      let pct = r.percentage != null ? Number(r.percentage) : NaN;
      if (Number.isNaN(pct) && r.totalgrade) {
        const m = String(r.totalgrade).match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) pct = parseFloat(m[1], 10);
      }
      const passed = Number.isFinite(pct) && pct >= 75;
      let answersObj = r.answers;
      if (typeof answersObj === 'string') {
        try {
          answersObj = JSON.parse(answersObj);
        } catch {
          answersObj = {};
        }
      }
      if (!answersObj || typeof answersObj !== 'object') answersObj = {};
      const tqp =
        r.total_questions_paper != null && Number.isFinite(Number(r.total_questions_paper))
          ? Number(r.total_questions_paper)
          : null;
      return {
        test_id: Number(tidKey),
        title: r.title || null,
        percentage: Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null,
        letter_grade: r.letter_grade || null,
        total_questions_paper: tqp,
        answers: answersObj,
        created_at: r.created_at || null,
        isOmr: !!(r.isOmr === true || r.isOmr === 1 || Number(r.isOmr) === 1),
        passed,
        completed: true,
      };
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ attempts }),
    };
  } catch (error) {
    console.error('listStudentAttempts:', error);
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

  if (httpMethod === 'GET') {
    try {
      return await listStudentAttempts(event);
    } catch (error) {
      console.error('handler GET:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
      };
    }
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
    if (httpMethod === 'POST') {
      return await submitOnlineTest(parsedBody || body, event);
    }
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  } catch (error) {
    console.error('handler:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
