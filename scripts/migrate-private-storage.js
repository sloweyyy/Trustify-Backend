/* eslint-disable no-restricted-syntax, no-await-in-loop, no-console, no-continue -- one-off sequential migration */
/**
 * One-off migration: move documents out of the public Supabase bucket.
 *
 * Before: uploads, notarized outputs and signatures were public URLs in the public
 * bucket, and NFT metadata (also public) linked to a public copy of the file.
 * After: those files live in the private bucket as `storage://<key>` references,
 * NFT metadata holds only a SHA-256 fingerprint, and the public copies are deleted.
 *
 *   node scripts/migrate-private-storage.js           # dry run: report only
 *   node scripts/migrate-private-storage.js --apply   # make the changes
 *
 * Needs MONGODB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Bucket names come from
 * SUPABASE_PUBLIC_BUCKET (default "trustify") and SUPABASE_BUCKET (default "trustify-documents").
 * Safe to re-run: already-migrated references are skipped.
 */
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_BUCKET = process.env.SUPABASE_PUBLIC_BUCKET || 'trustify';
const PRIVATE_BUCKET = process.env.SUPABASE_BUCKET || 'trustify-documents';
const METADATA_PREFIX = 'nft-metadata/';
const PUBLIC_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/`;
const COLLECTIONS = ['documents', 'sessions', 'requestsignatures', 'requestsessionsignatures', 'userwallets'];

const headers = (extra = {}) => ({ Authorization: `Bearer ${KEY}`, apikey: KEY, ...extra });
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const log = (...args) => console.log(APPLY ? '' : '[dry-run]', ...args);

const publicKeyOf = (value) =>
  typeof value === 'string' && value.startsWith(PUBLIC_URL_PREFIX)
    ? decodeURIComponent(value.slice(PUBLIC_URL_PREFIX.length).split('?')[0])
    : null;

// Fingerprint-only metadata, kept in sync with buildDocumentMetadata in src/config/blockchain.js.
const buildDocumentMetadata = (fileHash, notarizedAt) => ({
  name: 'Trustify Notarized Doc',
  symbol: 'DOC',
  description:
    'Bản ghi công chứng Trustify. Tài liệu được lưu riêng tư; đối chiếu bằng cách so mã băm SHA-256 của tệp với bản ghi này.',
  attributes: [
    { trait_type: 'issuer', value: 'Trustify' },
    { trait_type: 'hash_algorithm', value: 'SHA-256' },
    { trait_type: 'sha256', value: fileHash },
    { trait_type: 'notarized_at', value: notarizedAt.toISOString() },
  ],
  properties: { issuer: 'Trustify', hashAlgorithm: 'SHA-256', sha256: fileHash, notarizedAt: notarizedAt.toISOString() },
});

const ensurePrivateBucket = async () => {
  try {
    const { data } = await axios.get(`${SUPABASE_URL}/storage/v1/bucket/${PRIVATE_BUCKET}`, { headers: headers() });
    if (data.public) throw new Error(`Bucket ${PRIVATE_BUCKET} exists but is public; make it private first`);
    log(`private bucket ${PRIVATE_BUCKET} exists`);
  } catch (error) {
    if (!error.response || ![400, 404].includes(error.response.status)) throw error;
    log(`create private bucket ${PRIVATE_BUCKET}`);
    if (APPLY) {
      await axios.post(
        `${SUPABASE_URL}/storage/v1/bucket`,
        { id: PRIVATE_BUCKET, name: PRIVATE_BUCKET, public: false, file_size_limit: 20 * 1024 * 1024 },
        { headers: headers({ 'Content-Type': 'application/json' }) }
      );
    }
  }
};

const download = async (bucket, key) => {
  const res = await axios.get(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeKey(key)}`, {
    headers: headers(),
    responseType: 'arraybuffer',
  });
  return { buffer: Buffer.from(res.data), contentType: res.headers['content-type'] || 'application/octet-stream' };
};

const upload = (bucket, key, buffer, contentType) =>
  axios.post(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeKey(key)}`, buffer, {
    headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
    maxBodyLength: Infinity,
  });

const listAll = async (bucket, prefix = '') => {
  const { data } = await axios.post(
    `${SUPABASE_URL}/storage/v1/object/list/${bucket}`,
    { prefix, limit: 1000, offset: 0 },
    { headers: headers({ 'Content-Type': 'application/json' }) }
  );
  const keys = [];
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) keys.push(path);
    else keys.push(...(await listAll(bucket, path)));
  }
  return keys;
};

// Replace every legacy public file URL in a value; returns [newValue, changed].
const rewrite = (value, moved) => {
  const key = publicKeyOf(value);
  if (key && moved.has(key)) return [`storage://${key}`, true];
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const [v, c] = rewrite(item, moved);
      changed = changed || c;
      return v;
    });
    return [next, changed];
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    let changed = false;
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      const [nv, c] = rewrite(v, moved);
      next[k] = nv;
      changed = changed || c;
    }
    return [next, changed];
  }
  return [value, false];
};

const collectKeys = (value, keys) => {
  const key = publicKeyOf(value);
  if (key && !key.startsWith(METADATA_PREFIX)) keys.add(key);
  else if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === 'object' && !(value instanceof Date))
    Object.values(value).forEach((v) => collectKeys(v, keys));
};

const run = async () => {
  if (!SUPABASE_URL || !KEY || !process.env.MONGODB_URL)
    throw new Error('MONGODB_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  await mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true });
  const { db } = mongoose.connection;
  await ensurePrivateBucket();

  // 1. Find every document/output/signature file referenced from the database.
  const fileKeys = new Set();
  for (const name of COLLECTIONS) {
    for (const doc of await db.collection(name).find({}).toArray()) collectKeys(doc, fileKeys);
  }
  log(`files to move to ${PRIVATE_BUCKET}: ${fileKeys.size}`);

  // 2. Copy them into the private bucket.
  const moved = new Set();
  for (const key of fileKeys) {
    try {
      const { buffer, contentType } = await download(PUBLIC_BUCKET, key);
      if (APPLY) await upload(PRIVATE_BUCKET, key, buffer, contentType);
      moved.add(key);
    } catch (error) {
      console.warn(`  skip ${key}: ${error.response ? error.response.status : error.message}`);
    }
  }

  // 3. Point database references at the private copies.
  let updatedRecords = 0;
  for (const name of COLLECTIONS) {
    for (const doc of await db.collection(name).find({}).toArray()) {
      const [next, changed] = rewrite(doc, moved);
      if (!changed) continue;
      updatedRecords += 1;
      if (APPLY) await db.collection(name).replaceOne({ _id: doc._id }, next);
    }
  }
  log(`database records updated: ${updatedRecords}`);

  // 4. Fingerprint every minted output, rewrite its public metadata, and link wallet items to the file.
  const outputsByMetadata = new Map();
  for (const name of ['documents', 'sessions']) {
    for (const doc of await db
      .collection(name)
      .find({ 'output.metadataUri': { $ne: null } })
      .toArray()) {
      for (const output of doc.output || []) {
        if (output.metadataUri && typeof output.firebaseUrl === 'string')
          outputsByMetadata.set(output.metadataUri, { name, doc, output });
      }
    }
  }
  let metadataRewritten = 0;
  for (const [metadataUri, { name, doc, output }] of outputsByMetadata) {
    const fileRef = output.firebaseUrl;
    if (!fileRef.startsWith('storage://')) continue;
    const fileKey = fileRef.slice('storage://'.length);
    if (APPLY || moved.has(fileKey)) {
      const { buffer } = APPLY ? await download(PRIVATE_BUCKET, fileKey) : await download(PUBLIC_BUCKET, fileKey);
      const fileHash = sha256(buffer);
      const metadataKey = publicKeyOf(metadataUri);
      if (metadataKey) {
        const metadata = buildDocumentMetadata(fileHash, new Date(output.mintedAt || doc.updatedAt || Date.now()));
        if (APPLY) await upload(PUBLIC_BUCKET, metadataKey, Buffer.from(JSON.stringify(metadata)), 'application/json');
        metadataRewritten += 1;
      }
      if (APPLY) {
        await db
          .collection(name)
          .updateOne({ _id: doc._id, 'output.metadataUri': metadataUri }, { $set: { 'output.$.sha256': fileHash } });
        await db
          .collection('userwallets')
          .updateMany(
            { 'nftItems.metadataUri': metadataUri },
            { $set: { 'nftItems.$[item].fileUrl': fileRef, 'nftItems.$[item].sha256': fileHash } },
            { arrayFilters: [{ 'item.metadataUri': metadataUri }] }
          );
      }
    }
  }
  log(`NFT metadata rewritten to fingerprint-only: ${metadataRewritten}`);

  // 5. Delete public copies: moved files, document copies stored next to old metadata, and test leftovers.
  const publicKeys = await listAll(PUBLIC_BUCKET);
  const toDelete = publicKeys.filter(
    (key) =>
      moved.has(key) || (key.startsWith(METADATA_PREFIX) && !key.endsWith('/metadata.json')) || key.startsWith('smoke/')
  );
  log(`public objects to delete: ${toDelete.length}`);
  toDelete.forEach((key) => log(`  - ${key}`));
  if (APPLY && toDelete.length) {
    for (let i = 0; i < toDelete.length; i += 100) {
      await axios.delete(`${SUPABASE_URL}/storage/v1/object/${PUBLIC_BUCKET}`, {
        headers: headers({ 'Content-Type': 'application/json' }),
        data: { prefixes: toDelete.slice(i, i + 100) },
      });
    }
  }
  const remaining = publicKeys.filter((key) => !toDelete.includes(key));
  log(`public objects kept (metadata only): ${remaining.length}`);

  await mongoose.disconnect();
  log(APPLY ? 'Done.' : 'Dry run complete. Re-run with --apply to make these changes.');
};

run().catch((error) => {
  console.error(error.response ? error.response.data : error);
  process.exit(1);
});
