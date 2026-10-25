const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

jest.mock('../../../src/config/blockchain', () => {
  const actual = jest.requireActual('../../../src/config/blockchain');
  return { ...actual, getMetadataByMint: jest.fn() };
});

const { getMetadataByMint, buildDocumentMetadata } = require('../../../src/config/blockchain');
const nftRoute = require('../../../src/routes/v1/nft.route');
const { errorConverter, errorHandler } = require('../../../src/middlewares/error');

const app = express();
app.use('/v1/nft', nftRoute);
app.use(errorConverter);
app.use(errorHandler);

const pdf = Buffer.from('%PDF-1.4 notarized contract');
const pdfHash = crypto.createHash('sha256').update(pdf).digest('hex');
const record = (offChainMetadata) => ({ offChainMetadata, viewLinks: { explorerLink: 'https://explorer.solana.com/x' } });

const verify = (mintAddress, file = pdf, name = 'contract.pdf') => {
  const req = request(app).post('/v1/nft/verify-file');
  if (mintAddress !== undefined) req.field('mintAddress', mintAddress);
  if (file) req.attach('file', file, { filename: name, contentType: 'application/pdf' });
  return req;
};

describe('POST /v1/nft/verify-file', () => {
  beforeEach(() => getMetadataByMint.mockReset());

  test('matches the exact notarized file', async () => {
    getMetadataByMint.mockResolvedValue(record(buildDocumentMetadata(pdfHash, new Date('2026-10-26T00:00:00Z'))));
    const { body } = await verify('MintA').expect(200);
    expect(getMetadataByMint).toHaveBeenCalledWith('MintA');
    expect(body).toEqual(
      expect.objectContaining({
        match: true,
        fileHash: pdfHash,
        recordedHash: pdfHash,
        notarizedAt: '2026-10-26T00:00:00.000Z',
      })
    );
  });

  test('reports a mismatch for a different file', async () => {
    getMetadataByMint.mockResolvedValue(record(buildDocumentMetadata('b'.repeat(64))));
    const { body } = await verify('MintA').expect(200);
    expect(body.match).toBe(false);
  });

  test('returns match: null for legacy records without a fingerprint', async () => {
    getMetadataByMint.mockResolvedValue(record({ properties: { files: [{ uri: 'https://x/file.pdf' }] } }));
    const { body } = await verify('MintA').expect(200);
    expect(body.match).toBeNull();
    expect(body.recordedHash).toBeNull();
  });

  test('returns 404 when the mint address has no record', async () => {
    getMetadataByMint.mockRejectedValue(new Error('Account not found'));
    await verify('Unknown').expect(404);
  });

  test('requires a mint address and a file', async () => {
    await verify('').expect(400);
    await verify('MintA', null).expect(400);
    expect(getMetadataByMint).not.toHaveBeenCalled();
  });

  test('rejects file types the app does not accept', async () => {
    await request(app)
      .post('/v1/nft/verify-file')
      .field('mintAddress', 'MintA')
      .attach('file', Buffer.from('<html>'), { filename: 'page.html', contentType: 'text/html' })
      .expect(400);
  });
});
