/**
 * July GK workshop registrations — Lambda handler + schema.
 * API path: /julyWorkshop (extra_quries service)
 *
 * CREATE TABLE julyWorkship (
 *   id INT PRIMARY KEY AUTO_INCREMENT,
 *   branch VARCHAR(20),
 *   fullName VARCHAR(30),
 *   email VARCHAR(30),
 *   phoneNumber BIGINT UNIQUE,
 *   message VARCHAR(400),
 *   responded BOOL DEFAULT FALSE,
 *   respondMessage VARCHAR(200),
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 */
import { pool } from './db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const TABLE_NAME = 'julyWorkship';

const ALLOWED_BRANCHES = new Set(['Yelahanka', 'Online', 'Malleshwaram', 'Jayanagar']);
const GMAIL_EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,22}[a-z0-9])?@gmail\.com$/i;
const WORKSHOP_NAME_RE = /^[A-Za-z][A-Za-z\s.'-]{1,28}$/;
const WORKSHOP_PHONE_RE = /^(?:\+91[6-9]\d{9}|[6-9]\d{9})$/;
const UNSAFE_TEXT_RE = /<|>|javascript:|on\w+\s*=|script/i;

const trimMessage = (value, maxLen) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
};

const sanitizePlainText = (value, maxLen) => {
  const s = String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  if (!s || UNSAFE_TEXT_RE.test(s)) return '';
  return s.slice(0, maxLen);
};

const normalizeWorkshopPhone = (value) => String(value || '').trim().replace(/\s+/g, '');

const parseWorkshopPhone = (value) => {
  const normalized = normalizeWorkshopPhone(value);
  if (!WORKSHOP_PHONE_RE.test(normalized)) return null;
  let digits = normalized.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  const num = Number(digits);
  return Number.isFinite(num) ? num : null;
};

const validateWorkshopPayload = (data, { requireAll = false } = {}) => {
  if (!data || typeof data !== 'object') {
    return { ok: false, statusCode: 400, message: 'Invalid request body' };
  }
  if (data.website || data._hp || data.url) {
    return { ok: false, statusCode: 400, message: 'Invalid submission' };
  }

  const branch = data.branch != null ? sanitizePlainText(data.branch, 20) : '';
  const fullName = data.fullName != null ? sanitizePlainText(data.fullName, 30) : '';
  const email = data.email != null ? String(data.email).trim().toLowerCase().slice(0, 30) : '';
  const phoneRaw = data.phoneNumber != null ? String(data.phoneNumber).trim() : '';

  if (requireAll && (!branch || !fullName || !email || !phoneRaw)) {
    return {
      ok: false,
      statusCode: 400,
      message: 'branch, fullName, email, and phoneNumber are required',
    };
  }
  if (branch && !ALLOWED_BRANCHES.has(branch)) {
    return { ok: false, statusCode: 400, message: 'Invalid workshop branch selected' };
  }
  if (fullName && !WORKSHOP_NAME_RE.test(fullName)) {
    return { ok: false, statusCode: 400, message: 'Enter a valid full name (letters only, 2–30 characters)' };
  }
  if (email && !GMAIL_EMAIL_RE.test(email)) {
    return { ok: false, statusCode: 400, message: 'Email must be a valid @gmail.com address' };
  }
  const phoneNumber = phoneRaw ? parseWorkshopPhone(phoneRaw) : null;
  if (phoneRaw && phoneNumber == null) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Phone must be 10 digits starting with 6, 7, 8, or 9 — or +91 followed by the number',
    };
  }

  return {
    ok: true,
    branch,
    fullName,
    email,
    phoneNumber,
    message: trimMessage(data.message, 400),
  };
};

const toBoolOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return null;
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      branch VARCHAR(20),
      fullName VARCHAR(30),
      email VARCHAR(30),
      phoneNumber BIGINT UNIQUE,
      message VARCHAR(400),
      responded BOOL DEFAULT FALSE,
      respondMessage VARCHAR(200),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const getJulyWorkshops = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const id = params.id != null ? parseInt(String(params.id).trim(), 10) : null;
    const branch = params.branch != null ? String(params.branch).trim() : null;

    let query = `SELECT id, branch, fullName, email, phoneNumber, message, responded, respondMessage, created_at FROM ${TABLE_NAME} WHERE 1=1`;
    const queryParams = [];

    if (id != null && !Number.isNaN(id)) {
      query += ' AND id = ?';
      queryParams.push(id);
    }
    if (branch) {
      query += ' AND branch = ?';
      queryParams.push(branch);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('getJulyWorkshops:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (_) {}
    }
  }
};

const createJulyWorkshop = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const validated = validateWorkshopPayload(data, { requireAll: true });
    if (!validated.ok) {
      return {
        statusCode: validated.statusCode,
        headers: corsHeaders,
        body: JSON.stringify({ message: validated.message }),
      };
    }

    const { branch, fullName, email, phoneNumber, message } = validated;

    connection = await pool.getConnection();
    await ensureSchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO ${TABLE_NAME} (branch, fullName, email, phoneNumber, message, responded) VALUES (?, ?, ?, ?, ?, ?)`,
      [branch, fullName, email, phoneNumber, message, false],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Workshop registration saved', id: result.insertId }),
    };
  } catch (error) {
    console.error('createJulyWorkshop:', error);
    if (error && error.code === 'ER_DUP_ENTRY') {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'This phone number is already registered for the workshop' }),
      };
    }
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (_) {}
    }
  }
};

const updateJulyWorkshop = async (body) => {
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
    await ensureSchema(connection);

    const [existing] = await connection.execute(`SELECT id FROM ${TABLE_NAME} WHERE id = ?`, [id]);
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Record not found' }) };
    }

    const updateFields = [];
    const updateParams = [];

    if (data.branch !== undefined) {
      updateFields.push('branch = ?');
      updateParams.push((data.branch == null ? null : String(data.branch).trim().slice(0, 20)) || null);
    }
    if (data.fullName !== undefined) {
      updateFields.push('fullName = ?');
      updateParams.push((data.fullName == null ? null : String(data.fullName).trim().slice(0, 30)) || null);
    }
    if (data.email !== undefined) {
      const email = String(data.email).trim().toLowerCase().slice(0, 30);
      if (!GMAIL_EMAIL_RE.test(email)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Email must be a valid @gmail.com address' }),
        };
      }
      updateFields.push('email = ?');
      updateParams.push(email);
    }
    if (data.message !== undefined) {
      updateFields.push('message = ?');
      updateParams.push(trimMessage(data.message, 400));
    }
    if (data.responded !== undefined || data.isResponded !== undefined) {
      updateFields.push('responded = ?');
      updateParams.push(toBoolOrNull(data.responded !== undefined ? data.responded : data.isResponded));
    }
    if (data.respondMessage !== undefined || data.response_message !== undefined) {
      updateFields.push('respondMessage = ?');
      updateParams.push(trimMessage(
        data.respondMessage !== undefined ? data.respondMessage : data.response_message,
        200,
      ));
    }

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(id);
    await connection.execute(`UPDATE ${TABLE_NAME} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Workshop registration updated successfully' }),
    };
  } catch (error) {
    console.error('updateJulyWorkshop:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (_) {}
    }
  }
};

export const handler = async (event) => {
  const { httpMethod, body, queryStringParameters } = event;

  let parsedBody = null;
  if (body) {
    try {
      parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
    } catch (e) {
      console.error('Body parse:', e);
    }
  }

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS OK' }) };
  }

  try {
    switch (httpMethod) {
      case 'GET':
        return await getJulyWorkshops(queryStringParameters);
      case 'POST':
        return await createJulyWorkshop(parsedBody || body);
      case 'PUT':
        return await updateJulyWorkshop(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('julyWorkshop handler:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
