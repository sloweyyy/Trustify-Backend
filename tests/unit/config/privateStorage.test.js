const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

// Isolated local storage for this suite.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trustify-storage-'));
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR = path.join(tmp, 'public');
process.env.PRIVATE_UPLOAD_DIR = path.join(tmp, 'private');
process.env.SERVER_URL = 'https://api.example.test';
process.env.CLIENT_URL = 'https://app.example.test';

const storage = require('../../../src/config/storage');
const signFileRefs = require('../../../src/middlewares/signFileRefs');
const filesRoute = require('../../../src/routes/v1/files.route');
const { buildDocumentMetadata, getRecordedHash, publishDocumentRecord } = require('../../../src/config/blockchain');

const appWith = (handler) => {
  const app = express();
  app.use('/v1', signFileRefs);
  app.get('/v1/record', handler);
  app.use('/v1/files', filesRoute);
  return app;
};

const pathAndQuery = (url) => url.replace('https://api.example.test', '');

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('private file storage', () => {
  test('private uploads return a storage reference, not a URL', async () => {
    const ref = await storage.uploadFile('documents/doc1/cccd.pdf', Buffer.from('%PDF-1.4 private'), 'application/pdf');
    expect(ref).toBe('storage://documents/doc1/cccd.pdf');
    expect(fs.existsSync(path.join(tmp, 'public', 'documents/doc1/cccd.pdf'))).toBe(false);
    expect((await storage.downloadFile(ref)).toString()).toBe('%PDF-1.4 private');
  });

  test('public uploads return a public URL', async () => {
    const url = await storage.uploadFile('nft-metadata/x/metadata.json', Buffer.from('{}'), 'application/json', {
      visibility: 'public',
    });
    expect(url).toBe('https://api.example.test/uploads/nft-metadata/x/metadata.json');
  });

  test('signed links verify, and reject tampering and expiry', () => {
    const link = new URL(storage.signFileRef('storage://documents/doc1/cccd.pdf'));
    const exp = link.searchParams.get('exp');
    const sig = link.searchParams.get('sig');
    expect(link.pathname).toBe('/v1/files/documents/doc1/cccd.pdf');
    expect(storage.verifyFileSignature('documents/doc1/cccd.pdf', exp, sig)).toBe(true);
    expect(storage.verifyFileSignature('documents/doc2/cccd.pdf', exp, sig)).toBe(false);
    expect(storage.verifyFileSignature('documents/doc1/cccd.pdf', String(Number(exp) + 60), sig)).toBe(false);
    expect(storage.verifyFileSignature('documents/doc1/cccd.pdf', exp, `${sig}x`)).toBe(false);
    const expired = new URL(storage.signFileRef('storage://documents/doc1/cccd.pdf', -10));
    expect(
      storage.verifyFileSignature(
        'documents/doc1/cccd.pdf',
        expired.searchParams.get('exp'),
        expired.searchParams.get('sig')
      )
    ).toBe(false);
  });

  test('non-reference values pass through signFileRef unchanged', () => {
    expect(storage.signFileRef('https://gateway.pinata.cloud/ipfs/abc')).toBe('https://gateway.pinata.cloud/ipfs/abc');
    expect(storage.signFileRef(null)).toBeNull();
  });
});

describe('response signing and /v1/files', () => {
  test('nested storage references become working signed links; other values are untouched', async () => {
    const app = appWith((req, res) =>
      res.send({ files: [{ filename: 'cccd.pdf', firebaseUrl: 'storage://documents/doc1/cccd.pdf' }], note: 'storage note' })
    );
    const { body } = await request(app).get('/v1/record').expect(200);
    expect(body.note).toBe('storage note');
    const link = body.files[0].firebaseUrl;
    expect(link).toMatch(/^https:\/\/api\.example\.test\/v1\/files\/documents\/doc1\/cccd\.pdf\?exp=\d+&sig=/);

    const file = await request(app).get(pathAndQuery(link)).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toMatch(/^inline/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toBe("frame-ancestors 'self' https://app.example.test");
    expect(file.headers['x-frame-options']).toBeUndefined();
  });

  test('rejects unsigned, tampered and traversal requests', async () => {
    const app = appWith((req, res) => res.send({}));
    await request(app).get('/v1/files/documents/doc1/cccd.pdf').expect(403);
    const link = new URL(storage.signFileRef('storage://documents/doc1/cccd.pdf'));
    await request(app).get(`/v1/files/documents/doc2/cccd.pdf${link.search}`).expect(403);
    await request(app).get(`/v1/files/..%2F..%2Fetc%2Fpasswd${link.search}`).expect(403);
  });

  test('returns 404 for a validly signed link to a missing file', async () => {
    const app = appWith((req, res) => res.send({}));
    const link = storage.signFileRef('storage://documents/missing/file.pdf');
    await request(app).get(pathAndQuery(link)).expect(404);
  });

  test('serves non-renderable types as downloads', async () => {
    const ref = await storage.uploadFile('documents/doc1/contract.docx', Buffer.from('docx'), 'application/octet-stream');
    const app = appWith((req, res) => res.send({}));
    const file = await request(app)
      .get(pathAndQuery(storage.signFileRef(ref)))
      .expect(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment/);
  });
});

describe('document record metadata', () => {
  const hash = 'a'.repeat(64);

  test('contains the fingerprint and no file, file name or link', () => {
    const metadata = buildDocumentMetadata(hash, new Date('2026-10-26T00:00:00Z'));
    const text = JSON.stringify(metadata);
    expect(metadata.properties).toEqual({
      issuer: 'Trustify',
      hashAlgorithm: 'SHA-256',
      sha256: hash,
      notarizedAt: '2026-10-26T00:00:00.000Z',
    });
    expect(metadata.properties.files).toBeUndefined();
    expect(text).not.toMatch(/https?:|storage:\/\/|\.pdf/);
  });

  test('reads the recorded hash, and returns null for legacy metadata', () => {
    expect(getRecordedHash(buildDocumentMetadata(hash))).toBe(hash);
    expect(getRecordedHash({ properties: { files: [{ uri: 'https://x/file.pdf' }] } })).toBeNull();
    expect(getRecordedHash(null)).toBeNull();
  });

  test('publishDocumentRecord stores public metadata whose hash matches the file', async () => {
    const file = Buffer.from('%PDF-1.4 notarized output');
    const { metadataUri, sha256 } = await publishDocumentRecord(file);
    expect(sha256).toBe(storage.sha256(file));
    expect(metadataUri).toMatch(/^https:\/\/api\.example\.test\/uploads\/nft-metadata\//);
    const key = decodeURIComponent(metadataUri.replace('https://api.example.test/uploads/', ''));
    const stored = JSON.parse(fs.readFileSync(path.join(tmp, 'public', key), 'utf8'));
    expect(getRecordedHash(stored)).toBe(sha256);
  });
});
