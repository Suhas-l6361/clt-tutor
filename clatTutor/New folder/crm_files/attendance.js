import { pool } from './db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const TABLE_NAME = 'attendance';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
};

const toStr = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const toDateOrNull = (v) => {
  const s = toStr(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      batch VARCHAR(50),
      branch VARCHAR(50),
      target_year VARCHAR(50),
      attendance_date DATE NOT NULL,
      student_id VARCHAR(50) NOT NULL,
      name VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'absent',
      added_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_attendance_session_student (attendance_date, batch, branch, target_year, student_id)
    )
  `);
};

const SELECT_LIST = `
  id, batch, branch, target_year, attendance_date, student_id, name, status, added_by, created_at
`.replace(/\s+/g, ' ').trim();

const getAttendance = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const batch = params.batch != null ? cleanParam(params.batch) : null;
    const branch = params.branch != null ? cleanParam(params.branch) : null;
    const targetYear =
      params.targetYear != null
        ? cleanParam(params.targetYear)
        : params.target_year != null
          ? cleanParam(params.target_year)
          : null;
    const attendanceDate =
      params.attendance_date != null
        ? cleanParam(params.attendance_date)
        : params.attendanceDate != null
          ? cleanParam(params.attendanceDate)
          : null;
    const fromDate =
      params.from_date != null
        ? cleanParam(params.from_date)
        : params.fromDate != null
          ? cleanParam(params.fromDate)
          : null;
    const toDate =
      params.to_date != null
        ? cleanParam(params.to_date)
        : params.toDate != null
          ? cleanParam(params.toDate)
          : null;

    let query = `SELECT ${SELECT_LIST} FROM ${TABLE_NAME} WHERE 1=1`;
    const queryParams = [];

    if (batch) {
      query += ' AND batch = ?';
      queryParams.push(batch);
    }
    if (branch) {
      query += ' AND branch = ?';
      queryParams.push(branch);
    }
    if (targetYear) {
      query += ' AND target_year = ?';
      queryParams.push(targetYear);
    }
    if (attendanceDate) {
      query += ' AND attendance_date = ?';
      queryParams.push(toDateOrNull(attendanceDate));
    }
    if (fromDate) {
      query += ' AND attendance_date >= ?';
      queryParams.push(toDateOrNull(fromDate));
    }
    if (toDate) {
      query += ' AND attendance_date <= ?';
      queryParams.push(toDateOrNull(toDate));
    }

    query += ' ORDER BY attendance_date DESC, batch ASC, branch ASC, student_id ASC';
    const [rows] = await connection.execute(query, queryParams);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(rows),
    };
  } catch (error) {
    console.error('Error in getAttendance:', error);
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

const saveAttendance = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }

    const batch = toStr(data.batch);
    const branch = toStr(data.branch);
    const targetYear = toStr(data.targetYear ?? data.target_year);
    const attendanceDate = toDateOrNull(data.attendance_date ?? data.attendanceDate);
    const addedBy = toStr(data.added_by ?? data.addedBy);
    const records = Array.isArray(data.records) ? data.records : [];

    if (!batch || !branch || !targetYear || !attendanceDate) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'batch, branch, targetYear, and attendance_date are required',
        }),
      };
    }

    if (!records.length) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'records array is required' }),
      };
    }

    connection = await pool.getConnection();
    await ensureSchema(connection);
    await connection.beginTransaction();

    await connection.execute(
      `DELETE FROM ${TABLE_NAME} WHERE attendance_date = ? AND batch = ? AND branch = ? AND target_year = ?`,
      [attendanceDate, batch, branch, targetYear],
    );

    for (const rec of records) {
      const studentId = toStr(rec.student_id ?? rec.studentId);
      const name = toStr(rec.name);
      const statusRaw = toStr(rec.status);
      const status = statusRaw === 'present' ? 'present' : 'absent';
      if (!studentId) continue;

      await connection.execute(
        `INSERT INTO ${TABLE_NAME}
          (batch, branch, target_year, attendance_date, student_id, name, status, added_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [batch, branch, targetYear, attendanceDate, studentId, name, status, addedBy],
      );
    }

    await connection.commit();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Attendance saved successfully',
        savedCount: records.length,
      }),
    };
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }
    console.error('Error in saveAttendance:', error);
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
  const { httpMethod, body } = event;
  const queryStringParameters = event.queryStringParameters || {};

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
        return await getAttendance(queryStringParameters);
      case 'POST':
        return await saveAttendance(parsedBody || body);
      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }
  } catch (error) {
    console.error('Error handling attendance request:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
