import { pool } from './db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const TABLE_NAME = 'fees';

const cleanParam = (param) => {
  if (param === undefined || param === null) return null;
  return String(param).replace(/^['"]+|['"]+$/g, '').trim();
};

const relaxPhoneUniqueIfNeeded = async (connection) => {
  try {
    const [rows] = await connection.execute(
      `SELECT DISTINCT INDEX_NAME AS idx FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'phone' AND NON_UNIQUE = 0`,
      [TABLE_NAME],
    );
    for (const r of rows) {
      const idx = r.idx;
      if (!idx || idx === 'PRIMARY') continue;
      await connection.execute(`ALTER TABLE \`${TABLE_NAME}\` DROP INDEX \`${String(idx).replace(/`/g, '')}\``);
    }
  } catch (e) {
    console.warn('[fees] relaxPhoneUniqueIfNeeded:', e.message);
  }
};

const ensureSchema = async (connection) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INT PRIMARY KEY AUTO_INCREMENT,
      receipt_id VARCHAR(100) UNIQUE,
      receipt_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      student_id VARCHAR(50),
      name VARCHAR(40),
      email VARCHAR(50),
      phone BIGINT,
      dob DATE,
      batch VARCHAR(20),
      branch VARCHAR(30),
      address VARCHAR(1000),
      payement_mode VARCHAR(40),
      payment_date DATE,
      amount_paid BIGINT,
      cheque_no BIGINT,
      DraweeBank VARCHAR(100),
      bank_branch VARCHAR(100),
      transation_id VARCHAR(1000),
      bank VARCHAR(100),
      cardNum INT,
      network VARCHAR(50),
      upiTransation_id VARCHAR(1000),
      paymentDetails VARCHAR(1000),
      amount_in_words VARCHAR(1000),
      tution_fess BIGINT,
      amount_in_words_total VARCHAR(1000),
      installment_plan JSON,
      added_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await relaxPhoneUniqueIfNeeded(connection);
};

const SELECT_LIST = `
  id, receipt_id, receipt_date, student_id, name, email, phone, dob, batch, branch, address,
  payement_mode, payment_date, amount_paid, cheque_no, DraweeBank, bank_branch,
  transation_id, bank, cardNum, network, upiTransation_id, paymentDetails, amount_in_words,
  tution_fess, amount_in_words_total, installment_plan, added_by, created_at
`.replace(/\s+/g, ' ').trim();

const toStr = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const toBigIntOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'bigint' ? v : BigInt(String(v).replace(/[, ]/g, '').split('.')[0] || '0');
  return n;
};

const toIntOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

const toDateOrNull = (v) => {
  const s = toStr(v);
  if (!s || s === '—') return null;
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

const parseInstallmentPlan = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
};

/** MySQL JSON + JS BigInt: avoid JSON.stringify throwing on nested bigint */
const stringifyInstallmentPlan = (plan) => {
  if (plan == null) return null;
  return JSON.stringify(plan, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
};

const sanitizeCreatePayload = (raw) => {
  const x = typeof raw === 'string' ? JSON.parse(raw) : { ...raw };
  delete x.id;
  delete x.fee_id;
  if (x.data && typeof x.data === 'object') {
    x.data = { ...x.data };
    delete x.data.id;
    delete x.data.fee_id;
  }
  return x;
};

/** Unwrap { data: { ... } } from fees-page localStorage and merge studentDetail */
const normalizeIncoming = (raw) => {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (!data || typeof data !== 'object') return {};

  const out = { ...data };
  if (data.data && typeof data.data === 'object') {
    Object.assign(out, data.data);
    delete out.data;
  }
  const studentDetailSrc = out.studentDetail || data.studentDetail;
  if (studentDetailSrc && typeof studentDetailSrc === 'object') {
    const sd = studentDetailSrc;
    if (out.name == null && sd.name != null) out.name = sd.name;
    if (out.student_id == null && sd.studentId != null) out.student_id = sd.studentId;
    if (out.studentId == null && sd.studentId != null) out.studentId = sd.studentId;
    if (out.phone == null && sd.phone != null) out.phone = sd.phone;
    if (out.dob == null && sd.dob != null) out.dob = sd.dob;
    if (out.batch == null && sd.batch != null) out.batch = sd.batch;
    if (out.branch == null && sd.branch != null) out.branch = sd.branch;
    if (out.address == null && sd.address != null) out.address = sd.address;
  }
  return out;
};

/** Map API / form keys to DB column names */
const mapBodyToRow = (data) => {
  const d = normalizeIncoming(data);

  const receipt_id = toStr(d.receipt_id ?? d.receiptId ?? d.receiptIdDisplay);
  const student_id = toStr(d.student_id ?? d.studentId);
  const name = toStr(d.name);
  const email = toStr(d.email);
  let phoneRaw = d.phone;
  if (phoneRaw !== undefined && phoneRaw !== null && String(phoneRaw).trim() === '—') phoneRaw = null;
  const phone = phoneRaw != null && String(phoneRaw).trim() !== ''
    ? toBigIntOrNull(String(phoneRaw).replace(/\D/g, ''))
    : null;
  const dob = toDateOrNull(d.dob);
  const batch = toStr(d.batch);
  const branch = toStr(d.branch);
  const address = toStr(d.address);

  const payement_mode = toStr(d.payement_mode ?? d.paymentMode);
  const payment_date = toDateOrNull(d.payment_date ?? d.paymentDate);

  const amount_paid = d.amount_paid !== undefined || d.amountPaid !== undefined
    ? toBigIntOrNull(d.amount_paid ?? d.amountPaid)
    : null;

  const cheque_no = d.cheque_no !== undefined || d.chequeNo !== undefined
    ? toBigIntOrNull(d.cheque_no ?? d.chequeNo)
    : null;
  const DraweeBank = toStr(d.DraweeBank ?? d.draweeBank ?? d.chequeBank);
  const bank_branch = toStr(d.bank_branch ?? d.bankBranch ?? d.chequeBranch);
  const transation_id = toStr(d.transation_id ?? d.transactionId ?? d.onlineTxnId);
  const bank = toStr(d.bank ?? d.onlineBank);
  const cardNum = d.cardNum !== undefined || d.cardLast4 !== undefined
    ? toIntOrNull(d.cardNum ?? d.cardLast4)
    : null;
  const network = toStr(d.network ?? d.cardNetwork);
  const upiTransation_id = toStr(d.upiTransation_id ?? d.upiTransactionId);
  const paymentDetails = toStr(d.paymentDetails ?? d.otherPaymentDetail);

  const amount_in_words = toStr(d.amount_in_words ?? d.amountInWords);
  const tution_fess =
    d.tution_fess !== undefined ||
    d.tutionFee !== undefined ||
    d.tuitionFee !== undefined ||
    d.base_fees !== undefined ||
    d.baseFee !== undefined
      ? toBigIntOrNull(d.tution_fess ?? d.tutionFee ?? d.tuitionFee ?? d.base_fees ?? d.baseFee)
    : null;
  const amount_in_words_total = toStr(d.amount_in_words_total ?? d.netPayableWords);

  let installment_plan = parseInstallmentPlan(d.installment_plan ?? d.installmentPlan);
  if (installment_plan == null) {
    const rawDates = d['installmentDueDate[]'];
    const rawAmts = d['installmentAmount[]'];
    const dates = Array.isArray(rawDates)
      ? rawDates
      : (rawDates != null && String(rawDates).trim() !== '' ? [rawDates] : []);
    const amounts = Array.isArray(rawAmts)
      ? rawAmts
      : (rawAmts != null && String(rawAmts).trim() !== '' ? [rawAmts] : []);
    if (dates.length || amounts.length) {
      const n = Math.max(dates.length, amounts.length, 1);
      const rows = [];
      for (let i = 0; i < n; i++) {
        const due = dates[i];
        const amt = amounts[i];
        const dueEmpty = due == null || String(due).trim() === '';
        const amtEmpty = amt == null || String(amt).trim() === '';
        if (dueEmpty && amtEmpty) continue;
        const bi = !amtEmpty ? toBigIntOrNull(amt) : null;
        rows.push({
          due_date: toDateOrNull(due),
          amount: bi != null ? bi.toString() : null,
        });
      }
      installment_plan = rows.length ? rows : null;
    }
  }

  const added_by = toStr(d.added_by ?? d.addedBy);

  return {
    receipt_id,
    student_id,
    name,
    email,
    phone,
    dob,
    batch,
    branch,
    address,
    payement_mode,
    payment_date,
    amount_paid,
    cheque_no,
    DraweeBank,
    bank_branch,
    transation_id,
    bank,
    cardNum,
    network,
    upiTransation_id,
    paymentDetails,
    amount_in_words,
    tution_fess,
    amount_in_words_total,
    installment_plan,
    added_by,
  };
};

const genReceiptId = () => {
  const r = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `RCP-${Date.now()}-${r}`;
};

const rowForInsert = (mapped) => {
  const r = { ...mapped };
  if (!r.receipt_id) r.receipt_id = genReceiptId();
  return r;
};

const getFees = async (queryStringParameters) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await ensureSchema(connection);

    const params = queryStringParameters || {};
    const id = params.id != null ? cleanParam(params.id) : null;
    const receipt_id = params.receipt_id != null ? cleanParam(params.receipt_id) : null;
    const student_id = params.student_id != null ? cleanParam(params.student_id) : null;
    const phone = params.phone != null ? cleanParam(params.phone) : null;
    const email = params.email != null ? cleanParam(params.email) : null;

    let query = `SELECT ${SELECT_LIST} FROM ${TABLE_NAME} WHERE 1=1`;
    const queryParams = [];

    if (id) {
      query += ' AND id = ?';
      queryParams.push(parseInt(id, 10));
    }
    if (receipt_id) {
      query += ' AND receipt_id = ?';
      queryParams.push(receipt_id);
    }
    if (student_id) {
      query += ' AND student_id = ?';
      queryParams.push(student_id);
    }
    if (phone) {
      query += ' AND phone = ?';
      queryParams.push(Number(phone));
    }
    if (email) {
      query += ' AND email = ?';
      queryParams.push(email);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await connection.execute(query, queryParams);
    const parsed = (rows || []).map((row) => {
      if (row.installment_plan != null && typeof row.installment_plan === 'string') {
        try {
          row.installment_plan = JSON.parse(row.installment_plan);
        } catch {
          /* keep string */
        }
      }
      return row;
    });
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(parsed) };
  } catch (error) {
    console.error('Error in getFees:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const createFee = async (body) => {
  let connection;
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    if (!data || typeof data !== 'object') {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const mapped = mapBodyToRow(sanitizeCreatePayload(data));
    const row = rowForInsert(mapped);
    /* Always assign a fresh server id so repeat saves / same screen receipt # never collide */
    row.receipt_id = genReceiptId();

    if (!row.payment_date) {
      row.payment_date = new Date().toISOString().slice(0, 10);
    }

    if (!row.payement_mode) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'payement_mode (or paymentMode) is required' }) };
    }
    if (row.amount_paid == null) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'amount_paid (or amountPaid) is required' }) };
    }
    if (!row.name && !row.student_id) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'name or student_id is required' }) };
    }
    const instJson = stringifyInstallmentPlan(row.installment_plan);

    connection = await pool.getConnection();
    await ensureSchema(connection);

    const cols = [
      'receipt_id', 'student_id', 'name', 'email', 'phone', 'dob', 'batch', 'branch', 'address',
      'payement_mode', 'payment_date', 'amount_paid', 'cheque_no', 'DraweeBank', 'bank_branch',
      'transation_id', 'bank', 'cardNum', 'network', 'upiTransation_id', 'paymentDetails',
      'amount_in_words', 'tution_fess', 'amount_in_words_total', 'installment_plan', 'added_by',
    ];
    const vals = cols.map((c) => {
      if (c === 'installment_plan') return instJson;
      return row[c];
    });
    const ph = cols.map(() => '?').join(', ');
    const [result] = await connection.execute(
      `INSERT INTO ${TABLE_NAME} (${cols.join(', ')}) VALUES (${ph})`,
      vals,
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Fee receipt created successfully',
        id: result.insertId,
        receipt_id: row.receipt_id,
      }),
    };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Duplicate entry', error: error.message }) };
    }
    console.error('Error in createFee:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const hasKeyInBody = (root, ...keys) => {
  if (!root || typeof root !== 'object') return false;
  const pockets = [root, root.data, root.studentDetail].filter((x) => x && typeof x === 'object');
  for (const pocket of pockets) {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(pocket, k)) return true;
    }
  }
  return false;
};

const updateFee = async (body) => {
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

    const mapped = mapBodyToRow(data);

    const updateFields = [];
    const updateParams = [];

    const push = (col, val) => {
      updateFields.push(`${col} = ?`);
      updateParams.push(val);
    };

    if (hasKeyInBody(data, 'receipt_id', 'receiptId', 'receiptIdDisplay')) push('receipt_id', mapped.receipt_id);
    if (hasKeyInBody(data, 'student_id', 'studentId')) push('student_id', mapped.student_id);
    if (hasKeyInBody(data, 'name')) push('name', mapped.name);
    if (hasKeyInBody(data, 'email')) push('email', mapped.email);
    if (hasKeyInBody(data, 'phone')) push('phone', mapped.phone);
    if (hasKeyInBody(data, 'dob')) push('dob', mapped.dob);
    if (hasKeyInBody(data, 'batch')) push('batch', mapped.batch);
    if (hasKeyInBody(data, 'branch')) push('branch', mapped.branch);
    if (hasKeyInBody(data, 'address')) push('address', mapped.address);
    if (hasKeyInBody(data, 'payement_mode', 'paymentMode')) push('payement_mode', mapped.payement_mode);
    if (hasKeyInBody(data, 'payment_date', 'paymentDate')) push('payment_date', mapped.payment_date);
    if (hasKeyInBody(data, 'amount_paid', 'amountPaid')) push('amount_paid', mapped.amount_paid);
    if (hasKeyInBody(data, 'cheque_no', 'chequeNo')) push('cheque_no', mapped.cheque_no);
    if (hasKeyInBody(data, 'DraweeBank', 'draweeBank', 'chequeBank')) push('DraweeBank', mapped.DraweeBank);
    if (hasKeyInBody(data, 'bank_branch', 'bankBranch', 'chequeBranch')) push('bank_branch', mapped.bank_branch);
    if (hasKeyInBody(data, 'transation_id', 'transactionId', 'onlineTxnId')) push('transation_id', mapped.transation_id);
    if (hasKeyInBody(data, 'bank', 'onlineBank')) push('bank', mapped.bank);
    if (hasKeyInBody(data, 'cardNum', 'cardLast4')) push('cardNum', mapped.cardNum);
    if (hasKeyInBody(data, 'network', 'cardNetwork')) push('network', mapped.network);
    if (hasKeyInBody(data, 'upiTransation_id', 'upiTransactionId')) push('upiTransation_id', mapped.upiTransation_id);
    if (hasKeyInBody(data, 'paymentDetails', 'otherPaymentDetail')) push('paymentDetails', mapped.paymentDetails);
    if (hasKeyInBody(data, 'amount_in_words', 'amountInWords')) push('amount_in_words', mapped.amount_in_words);
    if (hasKeyInBody(data, 'tution_fess', 'tutionFee', 'tuitionFee', 'base_fees', 'baseFee')) {
      push('tution_fess', mapped.tution_fess);
    }
    if (hasKeyInBody(data, 'amount_in_words_total', 'netPayableWords')) push('amount_in_words_total', mapped.amount_in_words_total);
    if (hasKeyInBody(data, 'installment_plan', 'installmentPlan')) {
      push('installment_plan', stringifyInstallmentPlan(mapped.installment_plan));
    }
    if (hasKeyInBody(data, 'added_by', 'addedBy')) push('added_by', mapped.added_by);

    if (!updateFields.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No fields to update' }) };
    }

    updateParams.push(id);
    await connection.execute(`UPDATE ${TABLE_NAME} SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Fee receipt updated successfully' }) };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Duplicate entry', error: error.message }) };
    }
    console.error('Error in updateFee:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  } finally {
    if (connection) {
      try { connection.release(); } catch (_) {}
    }
  }
};

const deleteFee = async (body) => {
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
    console.error('Error in deleteFee:', error);
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
        return await getFees(queryStringParameters);
      case 'POST':
        return await createFee(parsedBody || body);
      case 'PUT':
        return await updateFee(parsedBody || body);
      case 'DELETE':
        return await deleteFee(parsedBody || body);
      default:
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error', error: error.message }) };
  }
};
