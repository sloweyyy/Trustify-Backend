/**
 * File storage with pluggable drivers, picked from env at startup:
 *   - supabase: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_BUCKET, default "trustify")
 *   - firebase: FIREBASE_PRIVATE_KEY + FIREBASE_STORAGE_BUCKET (see config/firebase.js)
 *   - local:    fallback, writes to UPLOAD_DIR (default ./uploads) and serves it at /uploads
 * Set STORAGE_DRIVER to force one.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const firebase = require('./firebase');

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || 'trustify';
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));

const pickDriver = () => {
  if (process.env.STORAGE_DRIVER) return process.env.STORAGE_DRIVER;
  if (supabaseUrl && supabaseKey) return 'supabase';
  if (firebase.bucket) return 'firebase';
  return 'local';
};

const driver = pickDriver();
logger.info(`Storage driver: ${driver}`);

const publicBaseUrl = () => (process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

// Keep object keys URL-safe while preserving the readable file name.
const safeKey = (key) =>
  key
    .split('/')
    .map((part) => part.replace(/[^\w.\-() ]+/g, '_'))
    .join('/');

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

const uploadFile = async (key, buffer, contentType = 'application/octet-stream') => {
  const objectKey = safeKey(key);

  if (driver === 'supabase') {
    await axios.post(`${supabaseUrl}/storage/v1/object/${supabaseBucket}/${encodeKey(objectKey)}`, buffer, {
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${encodeKey(objectKey)}`;
  }

  if (driver === 'firebase') {
    await firebase.bucket.file(objectKey).save(buffer, { contentType });
    return `https://storage.googleapis.com/${firebase.bucket.name}/${objectKey}`;
  }

  const filePath = path.join(uploadDir, objectKey);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return `${publicBaseUrl()}/uploads/${encodeKey(objectKey)}`;
};

const downloadFile = async (fileUrl) => {
  // Local files can be read straight from disk, which also works before SERVER_URL is reachable.
  const localPrefix = `${publicBaseUrl()}/uploads/`;
  if (fileUrl.startsWith(localPrefix)) {
    const key = decodeURIComponent(fileUrl.slice(localPrefix.length));
    return fs.promises.readFile(path.join(uploadDir, key));
  }
  if (fileUrl.startsWith('https://storage.googleapis.com/') && firebase.downloadFile) {
    return firebase.downloadFile(fileUrl);
  }
  const res = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
};

module.exports = { driver, uploadFile, downloadFile, uploadDir };
