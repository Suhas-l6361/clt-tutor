import { pool } from './db.js';
import crypto from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const ADMIN_TABLE = 'admin';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
};

const generatePassword = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const random = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[random[i] % chars.length];
  }
  return out;
};

const ensureAdminSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${ADMIN_TABLE} (
      admin_id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      email VARCHAR(100),
      branch VARCHAR(30),
      password VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const getAdmins = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureAdminSchema(connection);
    const params = queryStringParameters || {};
    const adminId = params.admin_id != null ? cleanParam(params.admin_id) : (params.id != null ? cleanParam(params.id) : null);
    const email = params.email != null ? cleanParam(params.email) : null;
    const branch = params.branch != null ? cleanParam(params.branch) : null;

    let query = `SELECT admin_id, name, email, branch, created_at FROM ${ADMIN_TABLE} WHERE 1=1`;
    const queryParams = [];
    if (adminId) {
      query += ' AND admin_id = ?';
      queryParams.push(parseInt(adminId, 10));
    }
    if (email) {
      query += ' AND email = ?';
      queryParams.push(email);
    }
    if (branch) {
      query += ' AND branch = ?';
      queryParams.push(branch);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('Error in getAdmins:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createAdmin = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const name = data.name != null ? String(data.name).trim() : '';
    const email = data.email != null ? String(data.email).trim() : '';
    const branch = data.branch != null ? String(data.branch).trim() : '';

    if (!name || !email || !branch) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'name, email, and branch are required' }) };
    }

    const password = generatePassword(6);

    connection = await pool.getConnection();
    await ensureAdminSchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO ${ADMIN_TABLE} (name, email, branch, password) VALUES (?, ?, ?, ?)`,
      [name, email, branch, password],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Admin created successfully',
        admin_id: result.insertId,
        password,
      }),
    };
  } catch (error) {
    console.error('Error in createAdmin:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateAdmin = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const idRaw = data.admin_id !== undefined && data.admin_id !== null ? data.admin_id : data.id;
    const adminId = idRaw !== undefined && idRaw !== null ? parseInt(idRaw, 10) : null;
    if (adminId === null || Number.isNaN(adminId)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'admin_id (or id) is required' }) };
    }

    connection = await pool.getConnection();
    await ensureAdminSchema(connection);
    const [existing] = await connection.execute(`SELECT admin_id FROM ${ADMIN_TABLE} WHERE admin_id = ?`, [adminId]);
    if (!existing.length) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Admin not found' }) };
    }

    const updateFields = [];
    const updateParams = [];

    if (data.name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push((data.name == null ? null : String(data.name).trim()) || null);
    }
    if (data.email !== undefined) {
      updateFields.push('email = ?');
      updateParams.push((data.email == null ? null : String(data.email).trim()) || null);
    }
    if (data.branch !== undefined) {
      updateFields.push('branch = ?');
      updateParams.push((data.branch == null ? null : String(data.branch).trim()) || null);
    }
    if (data.regenerate_password === true) {
      updateFields.push('password = ?');
      updateParams.push(generatePassword(6));
    }

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(adminId);
    await connection.execute(`UPDATE ${ADMIN_TABLE} SET ${updateFields.join(', ')} WHERE admin_id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Admin updated successfully' }) };
  } catch (error) {
    console.error('Error in updateAdmin:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteAdmin = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    let ids = [];
    if (Array.isArray(data.ids)) {
      ids = data.ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    } else if (data.admin_id !== undefined && data.admin_id !== null) {
      const n = parseInt(data.admin_id, 10);
      if (!Number.isNaN(n)) ids = [n];
    } else if (data.id !== undefined && data.id !== null) {
      const n = parseInt(data.id, 10);
      if (!Number.isNaN(n)) ids = [n];
    }

    if (!ids.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Provide admin_id, id, or ids array to delete' }) };
    }

    connection = await pool.getConnection();
    await ensureAdminSchema(connection);
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await connection.execute(`DELETE FROM ${ADMIN_TABLE} WHERE admin_id IN (${placeholders})`, ids);

    if (!result.affectedRows) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No admin(s) found to delete' }) };
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Admin(s) deleted successfully', deletedCount: result.affectedRows }) };
  } catch (error) {
    console.error('Error in deleteAdmin:', error);
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
        return await getAdmins(queryStringParameters);
      case 'POST':
        return await createAdmin(parsedBody || body);
      case 'PUT':
        return await updateAdmin(parsedBody || body);
      case 'DELETE':
        return await deleteAdmin(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
