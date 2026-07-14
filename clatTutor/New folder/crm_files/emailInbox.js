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

/** SES receive rule delivers incoming .eml files here (us-east-1). */
const INCOMING_BUCKET = 'clatutor-email-replies-596451157754';
const INCOMING_PREFIX = 'replies/';
const INCOMING_REGION = 'us-east-1';

/** CRM outbound replies (JSON) stored in same bucket, separate prefix. */
const REPLIES_BUCKET = 'clatutor-email-replies-596451157754';
const REPLIES_PREFIX = 'sent/';
const READ_STATUS_PREFIX = 'read-status/';
const REPLIES_REGION = 'us-east-1';

const FROM_EMAIL = 'hello@clatutor.com';
const SES_REGION = 'us-east-1';

/** Known domain spellings — SES mail may use either. */
const MAIL_DOMAIN_VARIANTS = ['clatutor.com', 'claututor.com'];

/** CRM mailboxes — incoming filtered by To / SES "for" recipient. */
const MAILBOXES = [
  { id: 'hello@clatutor.com', label: 'Hello', name: 'CLATutor Support' },
  { id: 'pranab.m@clatutor.com', label: 'Pranab M', name: 'Pranab M' },
  { id: 'anita.k@clatutor.com', label: 'Anita K', name: 'Anita K' },
  { id: 'niraj.k@clatutor.com', label: 'Niraj K', name: 'Niraj K' },
  { id: 'biplav.m@clatutor.com', label: 'Biplav M', name: 'Biplav M' },
];

const MAILBOX_IDS = new Set(MAILBOXES.map((mb) => mb.id.toLowerCase()));

/** In-memory cache — avoids re-listing/peeking S3 on every inbox API call. */
const INBOX_CACHE_TTL_MS = 45000;
let inboxCache = {
  incoming: null,
  replyMeta: null,
  replyFull: null,
  expiresAt: 0,
};

const invalidateInboxCache = () => {
  inboxCache = { incoming: null, replyMeta: null, replyFull: null, expiresAt: 0 };
};

const isInboxCacheFresh = () => inboxCache.expiresAt > Date.now();

const touchInboxCache = () => {
  inboxCache.expiresAt = Date.now() + INBOX_CACHE_TTL_MS;
};

const mailboxSlugFromId = (mailbox) => String(mailbox || '').toLowerCase().replace(/[@.]/g, '_');

const mailboxFromSlug = (slug) => {
  const s = String(slug || '').toLowerCase();
  const mb = MAILBOXES.find((m) => mailboxSlugFromId(m.id) === s);
  return mb ? mb.id.toLowerCase() : '';
};

/** Headers only — first 8KB is enough for To/From/Subject matching. */
const HEADER_PEEK_BYTES = 8191;

const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
};

const s3Incoming = new AWS.S3({ region: INCOMING_REGION });
const s3Replies = new AWS.S3({ region: REPLIES_REGION });
const ses = new AWS.SES({ region: SES_REGION });

const isBucketMissing = (error) => {
  const code = error?.code || '';
  const msg = String(error?.message || '');
  return code === 'NoSuchBucket' || /bucket does not exist/i.test(msg);
};

const safeListIncoming = async () => {
  try {
    return { items: await listAllIncomingSummaries(), warning: null };
  } catch (error) {
    if (isBucketMissing(error)) {
      return {
        items: [],
        warning: `Incoming bucket "${INCOMING_BUCKET}" not found (${INCOMING_REGION}). Create it in S3 for received mail.`,
      };
    }
    throw error;
  }
};

const safeListReplies = async () => {
  try {
    return { items: await listAllReplyRecords(), warning: null };
  } catch (error) {
    if (isBucketMissing(error)) {
      return {
        items: [],
        warning: `Replies bucket "${REPLIES_BUCKET}" not found (${REPLIES_REGION}). Create it in S3 to store sent replies.`,
      };
    }
    throw error;
  }
};

const mailboxSlug = (mailbox) => String(mailbox || '').toLowerCase().replace(/[@.]/g, '_');

const readStatusKey = (mailbox) => `${READ_STATUS_PREFIX}${mailboxSlug(mailbox)}.json`;

const loadReadKeys = async (mailbox) => {
  const mb = String(mailbox || '').trim().toLowerCase();
  if (!mb) return new Set();
  try {
    const obj = await s3Replies.getObject({ Bucket: REPLIES_BUCKET, Key: readStatusKey(mb) }).promise();
    const data = JSON.parse(obj.Body.toString('utf8'));
    const keys = Array.isArray(data.keys) ? data.keys : [];
    return new Set(keys.filter(Boolean));
  } catch (error) {
    if (error.code === 'NoSuchKey') return new Set();
    console.warn('loadReadKeys:', error.message);
    return new Set();
  }
};

const saveReadKeys = async (mailbox, keySet) => {
  const mb = String(mailbox || '').trim().toLowerCase();
  const keys = Array.from(keySet);
  await s3Replies
    .putObject({
      Bucket: REPLIES_BUCKET,
      Key: readStatusKey(mb),
      Body: JSON.stringify({ mailbox: mb, keys, updatedAt: new Date().toISOString() }, null, 2),
      ContentType: 'application/json',
    })
    .promise();
};

const markAsRead = async (body) => {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const mailbox = data?.mailbox ? String(data.mailbox).trim().toLowerCase() : '';
    const key = data?.key ? String(data.key).trim() : '';
    if (!mailbox || !key) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'mailbox and key are required' }),
      };
    }
    const keys = await loadReadKeys(mailbox);
    keys.add(key);
    await saveReadKeys(mailbox, keys);
    invalidateInboxCache();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Marked as read', mailbox, key, unreadCount: null }),
    };
  } catch (error) {
    console.error('markAsRead:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to mark as read', error: error.message }),
    };
  }
};

const attachReadState = (items, readKeys) =>
  items.map((item) => ({
    ...item,
    isRead: readKeys.has(item.key),
  }));

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

const parseHeaders = (headerText) => {
  const lines = String(headerText || '').split(/\r?\n/);
  const headers = {};
  let currentKey = null;
  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      headers[currentKey] += ` ${line.trim()}`;
    } else {
      const idx = line.indexOf(':');
      if (idx > 0) {
        currentKey = line.slice(0, idx).trim().toLowerCase();
        headers[currentKey] = line.slice(idx + 1).trim();
      }
    }
  }
  return headers;
};

const decodePart = (raw, encoding) => {
  const enc = String(encoding || '').toLowerCase();
  if (enc.includes('base64')) {
    try {
      return Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf8');
    } catch (_) {
      return raw;
    }
  }
  return raw;
};

const stripHtml = (html) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractBodyFromPart = (part) => {
  const split = part.split(/\r?\n\r?\n/);
  if (split.length < 2) return '';
  const partHeaders = parseHeaders(split[0]);
  const rawBody = split.slice(1).join('\n\n').replace(/\r?\n--\s*$/g, '').trim();
  const contentType = partHeaders['content-type'] || '';
  if (contentType.includes('multipart/')) {
    return extractMultipartBody(rawBody, contentType);
  }
  return decodePart(rawBody, partHeaders['content-transfer-encoding']);
};

const extractMultipartBody = (raw, contentType) => {
  const boundaryMatch = /boundary="?([^";\s]+)"?/i.exec(contentType || '');
  if (!boundaryMatch) return raw.trim();
  const boundary = boundaryMatch[1];
  const parts = raw.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  let plain = '';
  let html = '';
  for (const part of parts) {
    if (!part || part.trim() === '--' || !part.includes(':')) continue;
    const partHeaders = parseHeaders(part.split(/\r?\n\r?\n/)[0] || '');
    const ct = partHeaders['content-type'] || '';
    const body = extractBodyFromPart(part);
    if (!body) continue;
    if (ct.includes('text/plain') && !plain) plain = body;
    if (ct.includes('text/html') && !html) html = body;
  }
  if (plain) return plain.trim();
  if (html) return stripHtml(html);
  return raw.trim();
};

const parseEmlHeadersOnly = (raw) => {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  const splitIdx = text.search(/\r?\n\r?\n/);
  const headerText = splitIdx >= 0 ? text.slice(0, splitIdx) : text;
  const headers = parseHeaders(headerText);
  return {
    messageId: headers['message-id'] || null,
    from: headers.from || '',
    to: headers.to || '',
    cc: headers.cc || '',
    subject: headers.subject || '(no subject)',
    date: headers.date || null,
    headers,
    headerText,
    body: '',
  };
};

const parseEml = (raw) => {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  const splitIdx = text.search(/\r?\n\r?\n/);
  const headerText = splitIdx >= 0 ? text.slice(0, splitIdx) : text;
  const bodyRaw = splitIdx >= 0 ? text.slice(splitIdx).replace(/^\r?\n\r?\n/, '') : '';
  const headers = parseHeaders(headerText);
  const contentType = headers['content-type'] || 'text/plain';
  const body = contentType.includes('multipart/')
    ? extractMultipartBody(bodyRaw, contentType)
    : decodePart(bodyRaw, headers['content-transfer-encoding']);

  return {
    messageId: headers['message-id'] || null,
    from: headers.from || '',
    to: headers.to || '',
    cc: headers.cc || '',
    subject: headers.subject || '(no subject)',
    date: headers.date || null,
    body: body.trim(),
    bodyHtml: contentType.includes('text/html') && !contentType.includes('multipart/')
      ? body.trim()
      : extractHtmlBody(bodyRaw, contentType),
    headers,
  };
};

const extractHtmlBody = (bodyRaw, contentType) => {
  if (!contentType.includes('multipart/')) return '';
  const boundaryMatch = /boundary="?([^";\s]+)"?/i.exec(contentType || '');
  if (!boundaryMatch) return '';
  const boundary = boundaryMatch[1];
  const parts = bodyRaw.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  for (const part of parts) {
    if (!part || !part.includes('Content-Type: text/html')) continue;
    const body = extractBodyFromPart(part);
    if (body) return body.trim();
  }
  return '';
};

const normalizeEmail = (value) => {
  if (!value) return '';
  const m = String(value).match(/<([^>]+)>/);
  return (m ? m[1] : String(value)).trim().toLowerCase();
};

const mailboxLocalPart = (value) => String(value || '').toLowerCase().split('@')[0];

const canonicalizeMailboxEmail = (value) => {
  const norm = normalizeEmail(value);
  if (!norm || !norm.includes('@')) return norm;
  const [local, domain] = norm.split('@');
  if (!MAIL_DOMAIN_VARIANTS.includes(domain)) return norm;
  const mailbox = MAILBOXES.find((mb) => mailboxLocalPart(mb.id) === local);
  return mailbox ? mailbox.id.toLowerCase() : norm;
};

const extractDeliveredFor = (headerText) => {
  const matches = String(headerText || '').match(/for\s+<?([^\s>;]+@[^\s>;]+)>?/gi) || [];
  return matches
    .map((line) => {
      const m = line.match(/for\s+<?([^\s>;]+@[^\s>;]+)>?/i);
      return m ? normalizeEmail(m[1]) : '';
    })
    .filter(Boolean);
};

const collectRecipientCandidates = (parsed, headerText) => {
  const headers = parsed.headers || {};
  const delivered = extractDeliveredFor(headerText);
  const headerRecipients = [
    parsed.to,
    parsed.cc,
    headers['delivered-to'],
    headers['envelope-to'],
    headers['x-forwarded-to'],
    headers['x-original-to'],
    headers['x-rcpt-to'],
  ]
    .filter(Boolean)
    .join(', ');
  return [
    ...delivered,
    ...headerRecipients.split(/[,;]/).map((x) => normalizeEmail(x)).filter(Boolean),
  ]
    .map(canonicalizeMailboxEmail)
    .filter(Boolean);
};

const resolveMailboxForEmail = (parsed, headerText) => {
  const candidates = collectRecipientCandidates(parsed, headerText);
  for (const mailbox of MAILBOXES) {
    const id = mailbox.id.toLowerCase();
    if (candidates.includes(id)) return mailbox.id;
  }
  const headerLower = String(headerText || '').toLowerCase();
  for (const mailbox of MAILBOXES) {
    const local = mailboxLocalPart(mailbox.id);
    if (!local) continue;
    for (const domain of MAIL_DOMAIN_VARIANTS) {
      if (headerLower.includes(`${local}@${domain}`)) return mailbox.id;
    }
  }
  return null;
};

const matchesMailbox = (parsed, headerText, mailbox) => {
  if (!mailbox) return true;
  const target = canonicalizeMailboxEmail(mailbox);
  const resolved = resolveMailboxForEmail(parsed, headerText);
  if (resolved && canonicalizeMailboxEmail(resolved) === target) return true;
  const candidates = collectRecipientCandidates(parsed, headerText);
  if (candidates.includes(target)) return true;
  const toField = [parsed.to, parsed.cc, (parsed.headers || {})['delivered-to']]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const local = mailboxLocalPart(target);
  return MAIL_DOMAIN_VARIANTS.some((domain) => toField.includes(`${local}@${domain}`));
};

const peekEmlSummary = async (bucket, key) => {
  try {
    const head = await s3Incoming
      .getObject({ Bucket: bucket, Key: key, Range: `bytes=0-${HEADER_PEEK_BYTES}` })
      .promise();
    const rawText = head.Body.toString('utf8');
    const splitIdx = rawText.search(/\r?\n\r?\n/);
    const headerText = splitIdx >= 0 ? rawText.slice(0, splitIdx) : rawText;
    const parsed = parseEmlHeadersOnly(head.Body);
    const mailbox = resolveMailboxForEmail(parsed, headerText);
    const fromEmail = normalizeEmail(parsed.from);
    return {
      key,
      from: parsed.from,
      fromEmail,
      to: parsed.to,
      mailbox,
      subject: parsed.subject,
      date: parsed.date,
      messageId: parsed.messageId,
      snippet: '',
    };
  } catch (error) {
    console.warn('peekEmlSummary:', key, error.message);
    return {
      key,
      from: '',
      fromEmail: '',
      to: '',
      mailbox: null,
      subject: key.split('/').pop(),
      date: null,
      messageId: null,
      snippet: '',
    };
  }
};

const listIncomingObjectContents = async () => {
  const listed = await s3Incoming
    .listObjectsV2({ Bucket: INCOMING_BUCKET, Prefix: INCOMING_PREFIX })
    .promise();
  return (listed.Contents || []).filter((o) => {
    if (!o.Key || o.Key.endsWith('/')) return false;
    const name = o.Key.slice(INCOMING_PREFIX.length).split('/').pop() || '';
    if (!name || name === 'AMAZON_SES_SETUP_NOTIFICATION') return false;
    if (name.endsWith('.json')) return false;
    return true;
  });
};

const buildIncomingSummaries = async (contents) => {
  const sorted = contents.slice().sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
  const slice = sorted.slice(0, 200);
  const items = await mapWithConcurrency(slice, 12, async (obj) => {
    const summary = await peekEmlSummary(INCOMING_BUCKET, obj.Key);
    return {
      ...summary,
      lastModified: obj.LastModified,
      size: obj.Size,
    };
  });
  return items;
};

const getIncomingSummaries = async ({ force = false } = {}) => {
  if (!force && isInboxCacheFresh() && Array.isArray(inboxCache.incoming)) {
    return inboxCache.incoming;
  }
  const contents = await listIncomingObjectContents();
  const items = await buildIncomingSummaries(contents);
  inboxCache.incoming = items;
  touchInboxCache();
  return items;
};

const listAllIncomingSummaries = async () => getIncomingSummaries();

const listReplyObjectContents = async (mailbox) => {
  const mb = mailbox ? String(mailbox).trim().toLowerCase() : '';
  const prefix = mb ? `${REPLIES_PREFIX}${mailboxSlug(mb)}/` : REPLIES_PREFIX;
  const listed = await s3Replies.listObjectsV2({ Bucket: REPLIES_BUCKET, Prefix: prefix }).promise();
  return (listed.Contents || [])
    .filter((o) => o.Key && o.Key.endsWith('.json'))
    .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
};

const buildReplyMeta = (contents) =>
  contents.slice(0, 200).map((obj) => {
    const rel = obj.Key.slice(REPLIES_PREFIX.length);
    const slug = rel.split('/')[0] || '';
    const mailbox = mailboxFromSlug(slug);
    return {
      key: obj.Key,
      lastModified: obj.LastModified,
      mailbox,
      slug,
    };
  });

const getReplyMeta = async ({ force = false, mailbox = '' } = {}) => {
  const mb = mailbox ? String(mailbox).trim().toLowerCase() : '';
  if (!force && !mb && isInboxCacheFresh() && Array.isArray(inboxCache.replyMeta)) {
    return inboxCache.replyMeta;
  }
  const contents = await listReplyObjectContents(mb);
  const meta = buildReplyMeta(contents);
  if (!mb) {
    inboxCache.replyMeta = meta;
    touchInboxCache();
  }
  return meta;
};

const fetchReplyRecord = async (meta) => {
  try {
    const raw = await s3Replies.getObject({ Bucket: REPLIES_BUCKET, Key: meta.key }).promise();
    const data = JSON.parse(raw.Body.toString('utf8'));
    return {
      key: meta.key,
      lastModified: meta.lastModified,
      mailbox: canonicalizeMailboxEmail(data.mailbox || data.from || meta.mailbox || ''),
      ...data,
    };
  } catch (e) {
    console.warn('fetchReplyRecord skip:', meta.key, e.message);
    return null;
  }
};

const getReplyRecords = async ({ force = false, mailbox = '' } = {}) => {
  const mb = mailbox ? String(mailbox).trim().toLowerCase() : '';
  if (!force && !mb && isInboxCacheFresh() && Array.isArray(inboxCache.replyFull)) {
    return inboxCache.replyFull;
  }
  const meta = await getReplyMeta({ force, mailbox: mb });
  const records = await mapWithConcurrency(meta, 12, async (m) => fetchReplyRecord(m));
  const items = records.filter(Boolean);
  if (!mb) {
    inboxCache.replyFull = items;
    touchInboxCache();
  }
  return items;
};

const listAllReplyRecords = async () => getReplyRecords();

const loadAllReadKeys = async () => {
  const pairs = await Promise.all(
    MAILBOXES.map(async (mb) => {
      const id = mb.id.toLowerCase();
      const keys = await loadReadKeys(id);
      return [id, keys];
    }),
  );
  return new Map(pairs);
};

const shouldForceRefresh = (queryStringParameters) =>
  String(queryStringParameters?.refresh || '') === '1';

const listMailboxes = async (queryStringParameters) => {
  const force = shouldForceRefresh(queryStringParameters);
  if (force) invalidateInboxCache();
  try {
    const warnings = [];
    let incoming = [];
    let replyMeta = [];
    try {
      incoming = await getIncomingSummaries({ force });
    } catch (error) {
      if (isBucketMissing(error)) {
        warnings.push(
          `Incoming bucket "${INCOMING_BUCKET}" not found (${INCOMING_REGION}). Create it in S3 for received mail.`,
        );
      } else {
        throw error;
      }
    }
    try {
      replyMeta = await getReplyMeta({ force });
    } catch (error) {
      if (isBucketMissing(error)) {
        warnings.push(
          `Replies bucket "${REPLIES_BUCKET}" not found (${REPLIES_REGION}). Create it in S3 to store sent replies.`,
        );
      } else {
        throw error;
      }
    }
    const readKeysByMailbox = await loadAllReadKeys();
    const mailboxes = MAILBOXES.map((mb) => {
      const id = mb.id.toLowerCase();
      const mailboxItems = incoming.filter(
        (item) => canonicalizeMailboxEmail(item.mailbox || '') === id,
      );
      const readKeys = readKeysByMailbox.get(id) || new Set();
      const itemsWithRead = attachReadState(mailboxItems, readKeys);
      const inboxCount = mailboxItems.length;
      const unreadCount = itemsWithRead.filter((item) => !item.isRead).length;
      const sentCount = replyMeta.filter(
        (r) => canonicalizeMailboxEmail(r.mailbox || '') === id,
      ).length;
      return {
        ...mb,
        inboxCount,
        unreadCount,
        sentCount,
        totalCount: inboxCount + sentCount,
      };
    });
    const unmatchedCount = incoming.filter((item) => !item.mailbox).length;
    if (unmatchedCount > 0) {
      console.log(
        `emailInbox: ${unmatchedCount} of ${incoming.length} S3 message(s) had no mailbox match (ignored in UI; send/receive unaffected).`,
      );
    }
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        mailboxes,
        warnings,
        incomingTotal: incoming.length,
        unmatchedCount,
      }),
    };
  } catch (error) {
    console.error('listMailboxes:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to list mailboxes', error: error.message }),
    };
  }
};

const listInbox = async (queryStringParameters) => {
  const mailbox = queryStringParameters?.mailbox ? String(queryStringParameters.mailbox).trim().toLowerCase() : '';
  const force = shouldForceRefresh(queryStringParameters);
  if (force) invalidateInboxCache();
  try {
    const allItems = await getIncomingSummaries({ force });
    const items = mailbox
      ? allItems.filter((item) => canonicalizeMailboxEmail(item.mailbox || '') === mailbox)
      : allItems;
    const readKeys = mailbox ? await loadReadKeys(mailbox) : new Set();
    const itemsWithRead = attachReadState(items, readKeys);
    const unreadCount = itemsWithRead.filter((item) => !item.isRead).length;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        items: itemsWithRead.slice(0, 100),
        mailbox: mailbox || null,
        count: itemsWithRead.length,
        unreadCount,
        bucket: INCOMING_BUCKET,
        prefix: INCOMING_PREFIX,
        warning: null,
      }),
    };
  } catch (error) {
    console.error('listInbox:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to list inbox', error: error.message }),
    };
  }
};

const getInboxEmail = async (key, mailbox) => {
  if (!key) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'key is required' }) };
  }
  try {
    const obj = await s3Incoming.getObject({ Bucket: INCOMING_BUCKET, Key: key }).promise();
    const rawText = obj.Body.toString('utf8');
    const splitIdx = rawText.search(/\r?\n\r?\n/);
    const headerText = splitIdx >= 0 ? rawText.slice(0, splitIdx) : rawText;
    const parsed = parseEml(obj.Body);
    const resolvedMailbox = resolveMailboxForEmail(parsed, headerText);
    if (
      mailbox &&
      resolvedMailbox &&
      canonicalizeMailboxEmail(resolvedMailbox) !== canonicalizeMailboxEmail(mailbox)
    ) {
      if (!matchesMailbox(parsed, headerText, mailbox)) {
        return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'Email not found in this mailbox' }) };
      }
    }
    if (mailbox) {
      const keys = await loadReadKeys(mailbox);
      keys.add(key);
      await saveReadKeys(mailbox, keys);
    }
    invalidateInboxCache();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        key,
        ...parsed,
        mailbox: resolvedMailbox,
        fromEmail: normalizeEmail(parsed.from),
        isRead: true,
        lastModified: obj.LastModified,
        size: obj.ContentLength,
      }),
    };
  } catch (error) {
    console.error('getInboxEmail:', error);
    const code = error.code === 'NoSuchKey' ? 404 : 500;
    return {
      statusCode: code,
      headers: corsHeaders,
      body: JSON.stringify({ message: code === 404 ? 'Email not found' : 'Failed to read email', error: error.message }),
    };
  }
};

const listReplies = async (queryStringParameters) => {
  const threadKey = queryStringParameters?.thread_key ? String(queryStringParameters.thread_key).trim() : '';
  const mailbox = queryStringParameters?.mailbox ? String(queryStringParameters.mailbox).trim().toLowerCase() : '';
  const force = shouldForceRefresh(queryStringParameters);
  if (force) invalidateInboxCache();
  try {
    const allReplies = await getReplyRecords({ force, mailbox });
    const items = [];
    for (const data of allReplies) {
      if (threadKey && data.inReplyTo !== threadKey && data.originalKey !== threadKey) continue;
      items.push(data);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        items: items.slice(0, 100),
        count: items.length,
        mailbox: mailbox || null,
        bucket: REPLIES_BUCKET,
        prefix: REPLIES_PREFIX,
        warning: null,
      }),
    };
  } catch (error) {
    console.error('listReplies:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to list replies', error: error.message }),
    };
  }
};

const sendReply = async (body, event) => {
  try {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const to = data?.to ? String(data.to).trim() : '';
    const subject = data?.subject ? String(data.subject).trim() : '';
    const textBody = data?.body ? String(data.body).trim() : '';
    const inReplyTo = data?.inReplyTo ? String(data.inReplyTo).trim() : '';
    const originalKey = data?.originalKey ? String(data.originalKey).trim() : '';
    const mailbox = data?.mailbox ? String(data.mailbox).trim().toLowerCase() : '';
    const fromEmail = mailbox || (data?.fromMailbox ? String(data.fromMailbox).trim().toLowerCase() : FROM_EMAIL);

    if (!MAILBOX_IDS.has(fromEmail)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'Invalid mailbox. Use one of: ' + MAILBOXES.map((mb) => mb.id).join(', '),
        }),
      };
    }

    if (!to || !subject || !textBody) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'to, subject, and body are required' }),
      };
    }

    const user = getUserFromToken(event);
    const sentBy =
      user?.email || user?.name || user?.sub || (data?.sentBy ? String(data.sentBy).trim() : null) || 'crm';

    const sesResult = await ses
      .sendEmail({
        Source: fromEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Text: { Data: textBody, Charset: 'UTF-8' } },
        },
      })
      .promise();

    const sentAt = new Date().toISOString();
    const safeTs = sentAt.replace(/[:.]/g, '-');
    const mailboxSlug = fromEmail.replace(/[@.]/g, '_');
    const replyKey = `${REPLIES_PREFIX}${mailboxSlug}/${safeTs}-${Math.random().toString(36).slice(2, 8)}.json`;

    const record = {
      id: replyKey,
      mailbox: fromEmail,
      from: fromEmail,
      to,
      subject,
      body: textBody,
      inReplyTo: inReplyTo || originalKey || null,
      originalKey: originalKey || null,
      messageId: sesResult.MessageId || null,
      sentBy,
      sentAt,
    };

    await s3Replies
      .putObject({
        Bucket: REPLIES_BUCKET,
        Key: replyKey,
        Body: JSON.stringify(record, null, 2),
        ContentType: 'application/json',
      })
      .promise();

    invalidateInboxCache();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Reply sent and saved', ...record }),
    };
  } catch (error) {
    console.error('sendReply:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Failed to send reply', error: error.message }),
    };
  }
};

export const handler = async (event) => {
  const { httpMethod, body, queryStringParameters } = event;

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

  const action =
    queryStringParameters?.action ||
    parsedBody?.action ||
    (httpMethod === 'GET' ? 'list_inbox' : null);

  try {
    switch (action) {
      case 'list_mailboxes':
        return await listMailboxes(queryStringParameters);
      case 'list_inbox':
        return await listInbox(queryStringParameters);
      case 'get_inbox': {
        const key = queryStringParameters?.key ? String(queryStringParameters.key).trim() : '';
        const mailbox = queryStringParameters?.mailbox ? String(queryStringParameters.mailbox).trim() : '';
        return await getInboxEmail(key, mailbox);
      }
      case 'list_replies':
        return await listReplies(queryStringParameters);
      case 'send_reply':
        return await sendReply(parsedBody || body, event);
      case 'mark_read':
        return await markAsRead(parsedBody || body);
      default:
        if (httpMethod === 'GET') return await listMailboxes(queryStringParameters);
        if (httpMethod === 'POST' && parsedBody?.to) return await sendReply(parsedBody, event);
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            message: 'Unknown action. Use list_mailboxes, list_inbox, get_inbox, list_replies, send_reply, or mark_read',
          }),
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
