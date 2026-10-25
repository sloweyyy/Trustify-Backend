const express = require('express');
const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const { readPrivateFile, verifyFileSignature } = require('../../config/storage');

const router = express.Router();

// Types the app accepts on upload. Anything else is forced to download, never rendered.
const INLINE_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
const DOWNLOAD_TYPES = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * GET /v1/files/<key>?exp=<unix>&sig=<hmac>
 * Serves a private file through a short-lived signed link (see config/storage.js).
 * The link itself is the credential, so it works in <img>, <iframe> and new tabs.
 */
router.get(
  /^\/(.+)$/,
  catchAsync(async (req, res) => {
    const key = decodeURIComponent(req.params[0]);
    if (key.includes('..') || !verifyFileSignature(key, req.query.exp, req.query.sig)) {
      return res
        .status(httpStatus.FORBIDDEN)
        .json({ code: httpStatus.FORBIDDEN, message: 'Liên kết tệp không hợp lệ hoặc đã hết hạn' });
    }

    let file;
    try {
      file = await readPrivateFile(key);
    } catch (error) {
      const status = error.response && error.response.status;
      if (status === 400 || status === 404 || error.code === 'ENOENT') {
        return res.status(httpStatus.NOT_FOUND).json({ code: httpStatus.NOT_FOUND, message: 'Không tìm thấy tệp' });
      }
      throw error;
    }

    const fileName = key.split('/').pop();
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const inlineType = INLINE_TYPES[ext];
    const contentType = inlineType || DOWNLOAD_TYPES[ext] || 'application/octet-stream';
    const disposition = inlineType ? 'inline' : 'attachment';

    res.removeHeader('X-Frame-Options');
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // Allow the web app to show PDFs/images in an iframe, and nothing else.
      'Content-Security-Policy': `frame-ancestors 'self' ${process.env.CLIENT_URL || ''}`.trim(),
      'Referrer-Policy': 'no-referrer',
    });
    return res.send(file.buffer);
  })
);

module.exports = router;
