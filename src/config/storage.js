/**
 * File storage with pluggable drivers, picked from env at startup:
 *   - supabase: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - firebase: FIREBASE_PRIVATE_KEY + FIREBASE_STORAGE_BUCKET (see config/firebase.js)
 *   - local:    fallback for development
 * Set STORAGE_DRIVER to force one.
 *
 * Two visibilities:
 *   - private (default): notarized documents, uploads and signatures. Stored as a
 *     `storage://<key>` reference and only reachable through a short-lived signed
 *     link (`/v1/files/<key>?exp=..&sig=..`), see signFileRef/verifyFileSignature.
 *   - public: NFT metadata that wallets and explorers must be able to read.
 *     Contains a document fingerprint only, never the document itself.
 *
 * Supabase buckets: SUPABASE_BUCKET (private, default "trustify-documents") and
 * SUPABASE_PUBLIC_BUCKET (public, default "trustify").
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');
const firebase = require('./firebase');

const STORAGE_PREFIX = 'storage://';

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const privateBucket = process.env.SUPABASE_BUCKET || 'trustify-documents';
const publicBucket = process.env.SUPABASE_PUBLIC_BUCKET || 'trustify';
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
const privateUploadDir = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(__dirname, '../../storage-private'));
const fileUrlTtlSeconds = parseInt(process.env.FILE_URL_TTL_SECONDS, 10) || 3600;

const pickDriver = () => {
  if (process.env.STORAGE_DRIVER) return process.env.STORAGE_DRIVER;
  if (supabaseUrl && supabaseKey) return 'supabase';
  if (firebase.bucket) return 'firebase';
  return 'local';
};

const driver = pickDriver();
logger.info(`Storage driver: ${driver}`);

const serverBaseUrl = () => (process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

// Keep object keys URL-safe while preserving the readable file name.
const safeKey = (key) =>
  key
    .split('/')
    .map((part) => part.replace(/[^\w.\-() ]+/g, '_'))
    .join('/');

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

const supabaseHeaders = (contentType) => ({
  Authorization: `Bearer ${supabaseKey}`,
  apikey: supabaseKey,
  ...(contentType ? { 'Content-Type': contentType } : {}),
});

const isFileRef = (value) => typeof value === 'string' && value.startsWith(STORAGE_PREFIX);
const refToKey = (ref) => ref.slice(STORAGE_PREFIX.length);
const keyToRef = (key) => `${STORAGE_PREFIX}${key}`;

const uploadFile = async (key, buffer, contentType = 'application/octet-stream', { visibility = 'private' } = {}) => {
  const objectKey = safeKey(key);
  const isPublic = visibility === 'public';

  if (driver === 'supabase') {
    const bucket = isPublic ? publicBucket : privateBucket;
    await axios.post(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeKey(objectKey)}`, buffer, {
      headers: { ...supabaseHeaders(contentType), 'x-upsert': 'true' },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return isPublic ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeKey(objectKey)}` : keyToRef(objectKey);
  }

  if (driver === 'firebase') {
    const fileKey = isPublic ? `public/${objectKey}` : objectKey;
    await firebase.bucket.file(fileKey).save(buffer, { contentType });
    if (!isPublic) return keyToRef(objectKey);
    await firebase.bucket.file(fileKey).makePublic();
    return `https://storage.googleapis.com/${firebase.bucket.name}/${fileKey}`;
  }

  const filePath = path.join(isPublic ? uploadDir : privateUploadDir, objectKey);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return isPublic ? `${serverBaseUrl()}/uploads/${encodeKey(objectKey)}` : keyToRef(objectKey);
};

/** Read a private object. Returns { buffer, contentType }. */
const readPrivateFile = async (key) => {
  if (driver === 'supabase') {
    const res = await axios.get(`${supabaseUrl}/storage/v1/object/${privateBucket}/${encodeKey(key)}`, {
      headers: supabaseHeaders(),
      responseType: 'arraybuffer',
    });
    return { buffer: Buffer.from(res.data), contentType: res.headers['content-type'] };
  }
  if (driver === 'firebase') {
    const file = firebase.bucket.file(key);
    const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
    return { buffer, contentType: metadata.contentType };
  }
  const resolved = path.resolve(privateUploadDir, key);
  if (!resolved.startsWith(`${privateUploadDir}${path.sep}`)) throw new Error('Invalid file key');
  return { buffer: await fs.promises.readFile(resolved), contentType: undefined };
};

/** Download any stored file: a private `storage://` reference or a legacy public URL. */
const downloadFile = async (fileRef) => {
  if (isFileRef(fileRef)) return (await readPrivateFile(refToKey(fileRef))).buffer;

  // Legacy local public files can be read straight from disk.
  const localPrefix = `${serverBaseUrl()}/uploads/`;
  if (fileRef.startsWith(localPrefix)) {
    const key = decodeURIComponent(fileRef.slice(localPrefix.length));
    return fs.promises.readFile(path.join(uploadDir, key));
  }
  if (fileRef.startsWith('https://storage.googleapis.com/') && firebase.downloadFile) {
    return firebase.downloadFile(fileRef);
  }
  const res = await axios.get(fileRef, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
};

const signingKey = () => {
  const secret = process.env.FILE_URL_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('FILE_URL_SECRET or JWT_SECRET must be set to sign file links');
  return crypto.createHmac('sha256', 'trustify-file-links').update(secret).digest();
};

const signature = (key, exp) => crypto.createHmac('sha256', signingKey()).update(`${key}\n${exp}`).digest('base64url');

/** Turn a `storage://` reference into a short-lived download link. Other values pass through. */
const signFileRef = (value, ttlSeconds = fileUrlTtlSeconds) => {
  if (!isFileRef(value)) return value;
  const key = refToKey(value);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${serverBaseUrl()}/v1/files/${encodeKey(key)}?exp=${exp}&sig=${signature(key, exp)}`;
};

const verifyFileSignature = (key, exp, sig) => {
  const expiry = parseInt(exp, 10);
  if (!key || !sig || !Number.isInteger(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signature(key, expiry));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
  driver,
  uploadDir,
  privateBucket,
  publicBucket,
  STORAGE_PREFIX,
  isFileRef,
  refToKey,
  keyToRef,
  uploadFile,
  readPrivateFile,
  downloadFile,
  signFileRef,
  verifyFileSignature,
  sha256,
};
