const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { getMetadataByMint, getRecordedHash } = require('../config/blockchain');
const { sha256 } = require('../config/storage');

/**
 * Get NFT metadata by mint address
 */
const getNFTMetadata = catchAsync(async (req, res) => {
  const { mintAddress } = req.params;

  if (!mintAddress) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mint address is required');
  }

  const metadata = await getMetadataByMint(mintAddress);

  res.status(httpStatus.OK).send(metadata);
});

/**
 * Check a file against the fingerprint recorded in an NFT's public metadata.
 * The uploaded file is only hashed in memory; it is never stored.
 */
const verifyFile = catchAsync(async (req, res) => {
  const mintAddress = (req.body.mintAddress || '').trim();
  if (!mintAddress) throw new ApiError(httpStatus.BAD_REQUEST, 'Vui lòng nhập mã bản ghi (mint address)');
  if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'Vui lòng chọn tệp cần đối chiếu');

  let record;
  try {
    record = await getMetadataByMint(mintAddress);
  } catch (error) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Không tìm thấy bản ghi công chứng cho mã này');
  }

  const fileHash = sha256(req.file.buffer);
  const recordedHash = getRecordedHash(record.offChainMetadata);
  const properties = (record.offChainMetadata && record.offChainMetadata.properties) || {};

  res.status(httpStatus.OK).send({
    mintAddress,
    hashAlgorithm: 'SHA-256',
    fileHash,
    recordedHash,
    // null: the record predates fingerprints, so the file cannot be checked against it
    match: recordedHash ? recordedHash === fileHash : null,
    notarizedAt: properties.notarizedAt || null,
    issuer: properties.issuer || null,
    viewLinks: record.viewLinks,
  });
});

module.exports = {
  getNFTMetadata,
  verifyFile,
};
