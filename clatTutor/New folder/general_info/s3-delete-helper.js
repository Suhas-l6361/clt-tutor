/**
 * Collect S3 object keys from stored img_url / image_url values (plain key, JSON array, or HTTPS URL).
 */
export function keysFromImageField(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof val === 'object') {
    if (Buffer.isBuffer(val)) {
      try {
        return keysFromImageField(JSON.parse(val.toString('utf8')));
      } catch {
        return [];
      }
    }
    return [];
  }
  const t = String(val).trim();
  if (!t) return [];
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const u = new URL(t);
      const path = (u.pathname || '').replace(/^\/+/, '');
      return path ? [decodeURIComponent(path)] : [];
    } catch {
      return [];
    }
  }
  if (t.startsWith('[')) {
    try {
      return keysFromImageField(JSON.parse(t));
    } catch {
      return [t];
    }
  }
  return [t];
}

export async function deleteS3Objects(s3, bucket, keys) {
  const uniq = [...new Set((keys || []).filter(Boolean).map(String))];
  for (const Key of uniq) {
    try {
      await s3.deleteObject({ Bucket: bucket, Key }).promise();
    } catch (err) {
      console.error('S3 deleteObject failed', bucket, Key, err.message);
    }
  }
}
