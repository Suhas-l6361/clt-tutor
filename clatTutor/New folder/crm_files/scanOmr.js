/**
 * POST /scan_omr — template-based OMR scan (CLATutor 120-question sheet).
 * Body: { "image_base64": "<data URL or raw base64>" }
 */
import { scanOmrImage, decodeBase64Image } from './lib/omrScanner.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

const MAX_BYTES = 8 * 1024 * 1024;

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
    let body = {};
    if (event.body) {
      body = event.isBase64Encoded
        ? JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'))
        : JSON.parse(event.body);
    }

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
        body: JSON.stringify({ ok: false, message: 'Image too large (max 8MB).' }),
      };
    }

    const result = await scanOmrImage(buf);

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
