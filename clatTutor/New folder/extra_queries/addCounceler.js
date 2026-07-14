import crypto from 'crypto';
import { pool } from './db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const TABLE_NAME = 'add_counceler';
const USER_ID_AUTO_INCREMENT_START = 10101;
const PASSWORD_LENGTH = 8;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
};

const parseUserId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(String(value).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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

const trimField = (value, maxLen) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
};

/** Cryptographically random password (8 chars, no ambiguous 0/O/1/l). */
const generatePassword = () => {
  const bytes = crypto.randomBytes(PASSWORD_LENGTH);
  let out = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
};

const normalizeAccess = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch (_) {
      return JSON.stringify(value);
    }
  }
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
};

const parseAccess = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(50),
      branch VARCHAR(30),
      access JSON,
      password VARCHAR(30),
      isDrop BOOL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) AUTO_INCREMENT = ${USER_ID_AUTO_INCREMENT_START}
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
      [TABLE_NAME, columnName],
    );
    if (Array.isArray(rows) && rows[0] && Number(rows[0].cnt) === 0) {
      await connection.execute(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${ddl}`);
    }
  };

  await ensureColumn('name', 'name VARCHAR(50)');
  await ensureColumn('branch', 'branch VARCHAR(30)');
  await ensureColumn('access', 'access JSON');
  await ensureColumn('password', 'password VARCHAR(30)');
  await ensureColumn('isDrop', 'isDrop BOOL DEFAULT FALSE');
  await ensureColumn('created_at', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
};

const getCouncelers = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const userId = parseUserId(params.user_id);
    const branch = params.branch != null ? cleanParam(params.branch) : null;
    const name = params.name != null ? cleanParam(params.name) : null;
    const isDrop = params.isDrop != null ? toBoolOrNull(params.isDrop) : null;

    let query = `SELECT user_id, name, branch, access, isDrop, created_at FROM ${TABLE_NAME} WHERE 1=1`;
    const queryParams = [];

    if (userId) {
      query += ' AND user_id = ?';
      queryParams.push(userId);
    }
    if (branch) {
      query += ' AND branch = ?';
      queryParams.push(branch);
    }
    if (name) {
      query += ' AND name = ?';
      queryParams.push(name);
    }
    if (isDrop !== null) {
      query += ' AND isDrop = ?';
      queryParams.push(isDrop);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);

    const data = rows.map((row) => ({
      ...row,
      access: parseAccess(row.access),
      isDrop: row.isDrop === 1 || row.isDrop === true,
    }));

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
  } catch (error) {
    console.error('Error in getCouncelers:', error);
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

const createCounceler = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }
    if (data.action === 'login') {
      return await loginCounceler(data);
    }

    const name = trimField(data.name, 50);
    const branch = trimField(data.branch, 30);
    const access = normalizeAccess(data.access);
    const isDrop = toBoolOrNull(data.isDrop);
    const password = generatePassword();

    if (!name || !branch) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'name and branch are required' }),
      };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [result] = await connection.execute(
      `INSERT INTO ${TABLE_NAME} (name, branch, access, password, isDrop) VALUES (?, ?, ?, ?, ?)`,
      [name, branch, access, password, isDrop === null ? false : isDrop],
    );

    const userId = result.insertId;

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Counceler created successfully',
        user_id: userId,
        password,
      }),
    };
  } catch (error) {
    console.error('Error in createCounceler:', error);
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

const loginCounceler = async (data) => {
  let connection;
  try {
    const userId = parseUserId(data.user_id);
    const password = trimField(data.password, 30);
    if (!userId || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'user_id and password are required' }),
      };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [rows] = await connection.execute(
      `SELECT user_id, name, branch, access, isDrop FROM ${TABLE_NAME} WHERE user_id = ? AND password = ? LIMIT 1`,
      [userId, password],
    );
    if (!rows.length) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid user ID or password' }),
      };
    }

    const row = rows[0];
    if (toBoolOrNull(row.isDrop) === true) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'Your counceler account has been dropped. Please contact the institute.',
        }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        counceler: {
          user_id: row.user_id,
          name: row.name,
          branch: row.branch,
          access: parseAccess(row.access),
          isDrop: false,
        },
      }),
    };
  } catch (error) {
    console.error('Error in loginCounceler:', error);
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

const updateCounceler = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const userId = parseUserId(data.user_id);
    if (userId == null) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'user_id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [existing] = await connection.execute(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Record not found' }) };
    }

    const regeneratePassword = toBoolOrNull(data.regenerate_password) === true;
    const updateFields = [];
    const updateParams = [];
    let newPassword = null;

    if (data.name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push(trimField(data.name, 50));
    }
    if (data.branch !== undefined) {
      updateFields.push('branch = ?');
      updateParams.push(trimField(data.branch, 30));
    }
    if (data.access !== undefined) {
      updateFields.push('access = ?');
      updateParams.push(normalizeAccess(data.access));
    }
    if (data.isDrop !== undefined) {
      updateFields.push('isDrop = ?');
      updateParams.push(toBoolOrNull(data.isDrop));
    }
    if (regeneratePassword) {
      newPassword = generatePassword();
      updateFields.push('password = ?');
      updateParams.push(newPassword);
    }

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(userId);
    await connection.execute(`UPDATE ${TABLE_NAME} SET ${updateFields.join(', ')} WHERE user_id = ?`, updateParams);

    const response = { message: 'Counceler updated successfully', user_id: userId };
    if (newPassword) response.password = newPassword;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error in updateCounceler:', error);
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

const deleteCounceler = async (queryStringParameters, body) => {
  let connection;
  try {
    const params = queryStringParameters || {};
    let userId = parseUserId(params.user_id);

    if (userId == null && body) {
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      if (data && data.user_id != null) userId = parseUserId(data.user_id);
    }

    if (userId == null) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'user_id is required' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [existing] = await connection.execute(`SELECT user_id FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Record not found' }) };
    }

    await connection.execute(`DELETE FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Counceler deleted successfully', user_id: userId }),
    };
  } catch (error) {
    console.error('Error in deleteCounceler:', error);
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
      console.error('Error parsing body:', e);
    }
  }

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS OK' }) };
  }

  try {
    switch (httpMethod) {
      case 'GET':
        return await getCouncelers(queryStringParameters);
      case 'POST':
        return await createCounceler(parsedBody || body);
      case 'PUT':
        return await updateCounceler(parsedBody || body);
      case 'DELETE':
        return await deleteCounceler(queryStringParameters, parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
