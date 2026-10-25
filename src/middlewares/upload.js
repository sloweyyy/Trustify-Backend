const multer = require('multer');
const path = require('path');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

// One allowlist for every document upload. Extension and MIME type must both match,
// and extensions are compared case-insensitively (phones often produce .JPG / .JPEG).
const ALLOWED_TYPES = {
  '.pdf': ['application/pdf'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const isAllowedFile = (file) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeTypes = ALLOWED_TYPES[ext];
  return Boolean(mimeTypes && mimeTypes.includes(file.mimetype));
};

const fileFilter = (req, file, cb) => {
  if (isAllowedFile(file)) {
    return cb(null, true);
  }
  cb(new ApiError(httpStatus.BAD_REQUEST, 'Chỉ chấp nhận tệp PDF, Word (DOC, DOCX) hoặc ảnh (PNG, JPG, JPEG)'));
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE }, fileFilter });

module.exports = { upload, isAllowedFile, ALLOWED_TYPES, MAX_FILE_SIZE };
