const { uploadToPrivateIPFS, createPrivateAccessLink } = require('../config/blockchain');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

/**
 * Upload a file to private IPFS and create a temporary access link
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} fileName - The name of the file
 * @returns {Promise<Object>} The upload result with access links
 */
const uploadFileToPrivateIPFS = async (fileBuffer, fileName) => {
  try {
    // Upload file to private IPFS
    const uploadResult = await uploadToPrivateIPFS(fileBuffer, fileName);

    // Create access links for both file and metadata
    const fileAccessLink = await createPrivateAccessLink(uploadResult.fileCid, 60); // 60 seconds
    const metadataAccessLink = await createPrivateAccessLink(uploadResult.metadataCid, 60);

    return {
      ...uploadResult,
      fileAccessLink,
      metadataAccessLink,
    };
  } catch (error) {
    console.error('Error uploading to private IPFS:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload to private IPFS');
  }
};

/**
 * Create a new temporary access link for a private IPFS file
 * @param {string} cid - The IPFS CID
 * @param {number} expiresInSeconds - Time in seconds until the link expires (default: 60)
 * @returns {Promise<string>} The temporary access link
 */
const createNewAccessLink = async (cid, expiresInSeconds = 60) => {
  try {
    const accessLink = await createPrivateAccessLink(cid, expiresInSeconds);
    return accessLink;
  } catch (error) {
    console.error('Error creating access link:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create access link');
  }
};

module.exports = {
  uploadFileToPrivateIPFS,
  createNewAccessLink,
};
