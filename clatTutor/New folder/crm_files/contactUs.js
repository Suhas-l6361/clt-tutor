import { pool } from './db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const TABLE_NAME = 'contactUs';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      email VARCHAR(100),
      phone BIGINT,
      subject VARCHAR(100),
      message VARCHAR(1000),
      isResponded BOOL DEFAULT FALSE,
      respondedMessage VARCHAR(1000),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const getContactUsRequests = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const email = params.email != null ? cleanParam(params.email) : null;
    const phone = params.phone != null ? cleanParam(params.phone) : null;

    let query = `SELECT id, name, email, phone, subject, message, isResponded, respondedMessage, created_at FROM ${TABLE_NAME} WHERE 1=1`;
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
    console.error('Error in getContactUsRequests:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createContactUsRequest = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const name = data.name != null ? String(data.name).trim() : '';
    const email = data.email != null ? String(data.email).trim() : '';
    const phoneRaw = data.phone != null ? String(data.phone).trim() : '';
    const subject = data.subject != null ? String(data.subject).trim() : '';
    const message = data.message != null ? String(data.message).trim() : '';

    if (!name || !email || !phoneRaw || !subject || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'name, email, phone, subject, and message are required' }),
      };
    }

    const phone = Number(phoneRaw);
    if (!Number.isFinite(phone)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'phone must be a number' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const [result] = await connection.execute(
      `INSERT INTO ${TABLE_NAME} (name, email, phone, subject, message, isResponded, respondedMessage) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, phone, subject, message, null, null],
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Contact request created successfully', id: result.insertId }),
    };
  } catch (error) {
    console.error('Error in createContactUsRequest:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateContactUsRequest = async (body) => {
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

    if (data.name !== undefined) { updateFields.push('name = ?'); updateParams.push((data.name == null ? null : String(data.name).trim()) || null); }
    if (data.email !== undefined) { updateFields.push('email = ?'); updateParams.push((data.email == null ? null : String(data.email).trim()) || null); }
    if (data.phone !== undefined) {
      const p = data.phone == null || String(data.phone).trim() === '' ? null : Number(String(data.phone).trim());
      if (p === null || Number.isFinite(p)) { updateFields.push('phone = ?'); updateParams.push(p); }
    }
    if (data.subject !== undefined) { updateFields.push('subject = ?'); updateParams.push((data.subject == null ? null : String(data.subject).trim()) || null); }
    if (data.message !== undefined) { updateFields.push('message = ?'); updateParams.push((data.message == null ? null : String(data.message).trim()) || null); }
    if (data.isResponded !== undefined) { updateFields.push('isResponded = ?'); updateParams.push(data.isResponded == null ? null : Boolean(data.isResponded)); }
    if (data.respondedMessage !== undefined) { updateFields.push('respondedMessage = ?'); updateParams.push((data.respondedMessage == null ? null : String(data.respondedMessage).trim()) || null); }

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(id);
    await connection.execute(`UPDATE ${TABLE_NAME} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Contact request updated successfully' }) };
  } catch (error) {
    console.error('Error in updateContactUsRequest:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteContactUsRequest = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    let ids = [];
    if (Array.isArray(data.ids)) ids = data.ids.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    else if (data.id !== undefined && data.id !== null) {
      const n = parseInt(data.id, 10);
      if (!Number.isNaN(n)) ids = [n];
    }

    if (!ids.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Provide id or ids array to delete' }) };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await connection.execute(`DELETE FROM ${TABLE_NAME} WHERE id IN (${placeholders})`, ids);

    if (!result.affectedRows) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'No record(s) found to delete' }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Record(s) deleted successfully', deletedCount: result.affectedRows }) };
  } catch (error) {
    console.error('Error in deleteContactUsRequest:', error);
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
        return await getContactUsRequests(queryStringParameters);
      case 'POST':
        return await createContactUsRequest(parsedBody || body);
      case 'PUT':
        return await updateContactUsRequest(parsedBody || body);
      case 'DELETE':
        return await deleteContactUsRequest(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
