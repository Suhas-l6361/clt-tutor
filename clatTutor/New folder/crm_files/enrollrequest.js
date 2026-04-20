import { pool } from './db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const TABLE_NAME = 'enroll_request';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      target_year VARCHAR(50),
      course VARCHAR(50),
      student_name VARCHAR(50),
      parentName VARCHAR(50),
      student_email VARCHAR(100),
      parent_email VARCHAR(100),
      student_PhoneNumber BIGINT,
      parent_PhoneNumber BIGINT,
      student_dob DATE,
      address VARCHAR(1000),
      school_college VARCHAR(100),
      stream VARCHAR(50),
      source_of_info VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const getEnrollRequests = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const studentEmail = params.student_email != null ? cleanParam(params.student_email) : null;
    const parentEmail = params.parent_email != null ? cleanParam(params.parent_email) : null;
    const targetYear = params.target_year != null ? cleanParam(params.target_year) : null;
    const course = params.course != null ? cleanParam(params.course) : null;

    let query = `SELECT id, target_year, course, student_name, parentName, student_email, parent_email, student_PhoneNumber, parent_PhoneNumber, student_dob, address, school_college, stream, source_of_info, created_at FROM ${TABLE_NAME} WHERE 1=1`;
    const queryParams = [];

    if (id) {
      query += ' AND id = ?';
      queryParams.push(parseInt(id, 10));
    }
    if (studentEmail) {
      query += ' AND student_email = ?';
      queryParams.push(studentEmail);
    }
    if (parentEmail) {
      query += ' AND parent_email = ?';
      queryParams.push(parentEmail);
    }
    if (targetYear) {
      query += ' AND target_year = ?';
      queryParams.push(targetYear);
    }
    if (course) {
      query += ' AND course = ?';
      queryParams.push(course);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
  } catch (error) {
    console.error('Error in getEnrollRequests:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createEnrollRequest = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const targetYear = data.target_year != null ? String(data.target_year).trim() : '';
    const course = data.course != null ? String(data.course).trim() : '';
    const studentName = data.student_name != null ? String(data.student_name).trim() : '';
    const studentEmail = data.student_email != null ? String(data.student_email).trim() : '';
    const studentPhoneRaw = data.student_PhoneNumber != null ? String(data.student_PhoneNumber).trim() : '';

    if (!targetYear || !course || !studentName || !studentEmail || !studentPhoneRaw) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'target_year, course, student_name, student_email, and student_PhoneNumber are required' }),
      };
    }

    const studentPhone = Number(studentPhoneRaw);
    if (!Number.isFinite(studentPhone)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'student_PhoneNumber must be a number' }) };
    }

    const parentPhoneRaw = data.parent_PhoneNumber != null ? String(data.parent_PhoneNumber).trim() : '';
    const parentPhone = parentPhoneRaw ? Number(parentPhoneRaw) : null;
    if (parentPhoneRaw && !Number.isFinite(parentPhone)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'parent_PhoneNumber must be a number' }) };
    }

    const studentDob = data.student_dob != null ? String(data.student_dob).trim() : null;

    connection = await pool.getConnection();
    await ensureSchema(connection);
    const [result] = await connection.execute(
      `INSERT INTO ${TABLE_NAME} (target_year, course, student_name, parentName, student_email, parent_email, student_PhoneNumber, parent_PhoneNumber, student_dob, address, school_college, stream, source_of_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetYear,
        course,
        studentName,
        data.parentName != null ? String(data.parentName).trim() : null,
        studentEmail,
        data.parent_email != null ? String(data.parent_email).trim() : null,
        studentPhone,
        parentPhone,
        studentDob || null,
        data.address != null ? String(data.address).trim() : null,
        data.school_college != null ? String(data.school_college).trim() : null,
        data.stream != null ? String(data.stream).trim() : null,
        data.source_of_info != null ? String(data.source_of_info).trim() : null,
      ],
    );

    return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ message: 'Enroll request created successfully', id: result.insertId }) };
  } catch (error) {
    console.error('Error in createEnrollRequest:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const updateEnrollRequest = async (body) => {
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

    if (data.target_year !== undefined) { updateFields.push('target_year = ?'); updateParams.push((data.target_year == null ? null : String(data.target_year).trim()) || null); }
    if (data.course !== undefined) { updateFields.push('course = ?'); updateParams.push((data.course == null ? null : String(data.course).trim()) || null); }
    if (data.student_name !== undefined) { updateFields.push('student_name = ?'); updateParams.push((data.student_name == null ? null : String(data.student_name).trim()) || null); }
    if (data.parentName !== undefined) { updateFields.push('parentName = ?'); updateParams.push((data.parentName == null ? null : String(data.parentName).trim()) || null); }
    if (data.student_email !== undefined) { updateFields.push('student_email = ?'); updateParams.push((data.student_email == null ? null : String(data.student_email).trim()) || null); }
    if (data.parent_email !== undefined) { updateFields.push('parent_email = ?'); updateParams.push((data.parent_email == null ? null : String(data.parent_email).trim()) || null); }
    if (data.student_PhoneNumber !== undefined) {
      const p = data.student_PhoneNumber == null || String(data.student_PhoneNumber).trim() === '' ? null : Number(String(data.student_PhoneNumber).trim());
      if (p === null || Number.isFinite(p)) { updateFields.push('student_PhoneNumber = ?'); updateParams.push(p); }
    }
    if (data.parent_PhoneNumber !== undefined) {
      const p = data.parent_PhoneNumber == null || String(data.parent_PhoneNumber).trim() === '' ? null : Number(String(data.parent_PhoneNumber).trim());
      if (p === null || Number.isFinite(p)) { updateFields.push('parent_PhoneNumber = ?'); updateParams.push(p); }
    }
    if (data.student_dob !== undefined) { updateFields.push('student_dob = ?'); updateParams.push((data.student_dob == null ? null : String(data.student_dob).trim()) || null); }
    if (data.address !== undefined) { updateFields.push('address = ?'); updateParams.push((data.address == null ? null : String(data.address).trim()) || null); }
    if (data.school_college !== undefined) { updateFields.push('school_college = ?'); updateParams.push((data.school_college == null ? null : String(data.school_college).trim()) || null); }
    if (data.stream !== undefined) { updateFields.push('stream = ?'); updateParams.push((data.stream == null ? null : String(data.stream).trim()) || null); }
    if (data.source_of_info !== undefined) { updateFields.push('source_of_info = ?'); updateParams.push((data.source_of_info == null ? null : String(data.source_of_info).trim()) || null); }

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(id);
    await connection.execute(`UPDATE ${TABLE_NAME} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Enroll request updated successfully' }) };
  } catch (error) {
    console.error('Error in updateEnrollRequest:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteEnrollRequest = async (body) => {
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
    console.error('Error in deleteEnrollRequest:', error);
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
        return await getEnrollRequests(queryStringParameters);
      case 'POST':
        return await createEnrollRequest(parsedBody || body);
      case 'PUT':
        return await updateEnrollRequest(parsedBody || body);
      case 'DELETE':
        return await deleteEnrollRequest(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
