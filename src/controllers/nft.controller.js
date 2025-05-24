const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { getMetadataByMint } = require('../config/blockchain');

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

module.exports = {
  getNFTMetadata,
};
