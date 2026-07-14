import { pool } from './db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const TABLE_NAME = 'demoClass';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
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

const trimResponseMessage = (value) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, 100);
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(50),
      email VARCHAR(50),
      phone BIGINT,
      interested_in VARCHAR(50),
      isResponded BOOL DEFAULT FALSE,
      response_message VARCHAR(100),
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
      [TABLE_NAME, columnName],
    );
    if (Array.isArray(rows) && rows[0] && Number(rows[0].cnt) === 0) {
      await connection.execute(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${ddl}`);
    }
  };
  await ensureColumn('isResponded', 'isResponded BOOL DEFAULT FALSE');
  await ensureColumn('response_message', 'response_message VARCHAR(100)');
};

const getDemoClasses = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const email = params.email != null ? cleanParam(params.email) : null;
    const phone = params.phone != null ? cleanParam(params.phone) : null;

    let query = `SELECT id, name, email, phone, interested_in, isResponded, response_message, created_at FROM ${TABLE_NAME} WHERE 1=1`;
    const queryParams = [];

    if (id) {
      query += ' AND id = ?';
      queryParams.push(parseInt(id, 10));
    }
    if (email) {
      query += ' AND email = ?';
      queryParams.push(email);
    }
    if (phone) {
      query += ' AND phone = ?';
      queryParams.push(Number(phone));
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('Error in getDemoClasses:', error);
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

const createDemoClass = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const name = data.name != null ? String(data.name).trim() : '';
    const email = data.email != null ? String(data.email).trim() : '';
    const phoneRaw = data.phone != null ? String(data.phone).trim() : '';
    const interestedIn = data.interested_in != null ? String(data.interested_in).trim() : '';

    if (!name || !email || !phoneRaw || !interestedIn) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'name, email, phone, and interested_in are required' }),
      };
    }

    const phone = Number(phoneRaw);
    if (!Number.isFinite(phone)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'phone must be a number' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const normalizedEmail = email.toLowerCase();
    const [existingRows] = await connection.execute(
      `SELECT id FROM ${TABLE_NAME} WHERE LOWER(TRIM(email)) = ? OR phone = ? LIMIT 1`,
      [normalizedEmail, phone],
    );
    if (existingRows.length) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'You have already submitted a demo class request. Please wait for our callback.',
          alreadyExists: true,
        }),
      };
    }

    const [result] = await connection.execute(
      `INSERT INTO ${TABLE_NAME} (name, email, phone, interested_in) VALUES (?, ?, ?, ?)`,
      [name, email, phone, interestedIn],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Demo class request created successfully', id: result.insertId }),
    };
  } catch (error) {
    console.error('Error in createDemoClass:', error);
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

const updateDemoClass = async (body) => {
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

    if (data.name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push((data.name == null ? null : String(data.name).trim()) || null);
    }
    if (data.email !== undefined) {
      updateFields.push('email = ?');
      updateParams.push((data.email == null ? null : String(data.email).trim()) || null);
    }
    if (data.phone !== undefined) {
      const p = data.phone == null || String(data.phone).trim() === '' ? null : Number(String(data.phone).trim());
      if (p === null || Number.isFinite(p)) {
        updateFields.push('phone = ?');
        updateParams.push(p);
      }
    }
    if (data.interested_in !== undefined) {
      updateFields.push('interested_in = ?');
      updateParams.push((data.interested_in == null ? null : String(data.interested_in).trim()) || null);
    }
    if (data.isResponded !== undefined) {
      updateFields.push('isResponded = ?');
      updateParams.push(toBoolOrNull(data.isResponded));
    }
    if (data.response_message !== undefined) {
      updateFields.push('response_message = ?');
      updateParams.push(trimResponseMessage(data.response_message));
    }

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(id);
    await connection.execute(`UPDATE ${TABLE_NAME} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Demo class request updated successfully' }),
    };
  } catch (error) {
    console.error('Error in updateDemoClass:', error);
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
        return await getDemoClasses(queryStringParameters);
      case 'POST':
        return await createDemoClass(parsedBody || body);
      case 'PUT':
        return await updateDemoClass(parsedBody || body);
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
