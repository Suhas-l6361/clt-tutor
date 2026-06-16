/**
 * Lambda entry (bundled to CJS) — scan_omr API
 */
import { scanOmrImage, decodeBase64Image } from './lib/omrScanner.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const MAX_BYTES = 6 * 1024 * 1024;
const SCAN_MS = 24000;

function parseBody(event) {
  if (!event.body) return {};
  if (event.isBase64Encoded) {
    return JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'));
  }
  return JSON.parse(event.body);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, message: 'Use POST with image_base64.' }),
    };
  }

  try {
    const body = parseBody(event);
    const raw = body.image_base64 || body.image || body.dataUrl || '';
    if (!raw) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, message: 'Missing image_base64.' }),
      };
    }

    const buf = decodeBase64Image(raw);
    if (buf.length > MAX_BYTES) {
      return {
        statusCode: 413,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, message: 'Image too large (max 6MB).' }),
      };
    }

    const result = await Promise.race([
      scanOmrImage(buf),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Scan timed out. Use a smaller photo or retry.')), SCAN_MS)
      ),
    ]);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        responses: result.responses,
        totalQuestions: result.totalQuestions,
        debug: result.debug,
      }),
    };
  } catch (err) {
    console.error('scan_omr:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        message: err && err.message ? err.message : 'OMR scan failed.',
      }),
    };
  }
};
