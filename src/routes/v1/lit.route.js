const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { encryptFileWithLit, decryptFileWithLit } = require('../../config/lit-protocol');
const { uploadToIPFS } = require('../../config/blockchain-test');

const router = express.Router();

// Set up multer for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../public/uploads');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

/**
 * @api {post} /v1/lit/encrypt-upload Upload and encrypt a file using Lit Protocol
 * @apiDescription Upload a file, encrypt it with Lit Protocol, and upload to IPFS
 * @apiVersion 1.0.0
 * @apiName EncryptUpload
 * @apiGroup Lit
 * @apiPermission public
 *
 * @apiParam {File} file The file to encrypt and upload
 *
 * @apiSuccess {String} message Success message
 * @apiSuccess {Object} data Response data
 * @apiSuccess {String} data.metadataUri IPFS URI for the metadata
 * @apiSuccess {Object} data.encryptionDetails Encryption details
 */
router.post('/encrypt-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Read the file from disk
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = req.file.originalname;

    console.log(`Processing file: ${fileName}`);

    // Encrypt the file with Lit Protocol
    const { encryptedFile, encryptedSymmetricKey, accessControlConditions } = await encryptFileWithLit(fileBuffer);

    console.log('File encrypted successfully');

    // Save encrypted file temporarily
    const encryptedFilePath = path.join(path.dirname(filePath), `encrypted-${path.basename(filePath)}`);
    fs.writeFileSync(encryptedFilePath, encryptedFile);

    // Upload to IPFS
    console.log('Uploading to IPFS...');
    const metadataUri = await uploadToIPFS(encryptedFile, fileName);

    // Clean up temporary files
    fs.unlinkSync(filePath);
    fs.unlinkSync(encryptedFilePath);

    return res.json({
      message: 'File encrypted and uploaded successfully',
      data: {
        metadataUri,
        encryptionDetails: {
          encryptedSymmetricKey,
          accessControlConditions,
        },
      },
    });
  } catch (error) {
    console.error('Error in encrypt-upload:', error);
    return res.status(500).json({
      message: 'Error processing file',
      error: error.message,
    });
  }
});

/**
 * @api {post} /v1/lit/decrypt Decrypt a file using Lit Protocol
 * @apiDescription Decrypt a file that was encrypted with Lit Protocol
 * @apiVersion 1.0.0
 * @apiName DecryptFile
 * @apiGroup Lit
 * @apiPermission public
 *
 * @apiParam {Buffer} encryptedFile The encrypted file buffer
 * @apiParam {String} encryptedSymmetricKey The encrypted symmetric key from Lit
 * @apiParam {Object} accessControlConditions Access control conditions used for encryption
 *
 * @apiSuccess {String} message Success message
 * @apiSuccess {Buffer} data.decryptedFile The decrypted file buffer
 */
router.post('/decrypt', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { encryptedFile, encryptedSymmetricKey, accessControlConditions } = req.body;

    if (!encryptedFile || !encryptedSymmetricKey || !accessControlConditions) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Convert base64 encoded file back to buffer
    const encryptedFileBuffer = Buffer.from(encryptedFile, 'base64');

    // Decrypt the file with Lit Protocol
    const decryptedFile = await decryptFileWithLit(encryptedFileBuffer, encryptedSymmetricKey, accessControlConditions);

    return res.json({
      message: 'File decrypted successfully',
      data: {
        decryptedFile: decryptedFile.toString('base64'),
      },
    });
  } catch (error) {
    console.error('Error in decrypt:', error);
    return res.status(500).json({
      message: 'Error decrypting file',
      error: error.message,
    });
  }
});

/**
 * @api {get} /v1/lit/test-form Display a test form for file upload
 * @apiDescription Serves a simple HTML form for testing file upload
 * @apiVersion 1.0.0
 * @apiName TestForm
 * @apiGroup Lit
 * @apiPermission public
 */
router.get('/test-form', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Lit Protocol File Upload</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        form { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="file"] { width: 100%; padding: 8px; }
        button { background: #4CAF50; color: white; padding: 10px 15px; border: none; cursor: pointer; }
        button:hover { background: #45a049; }
        #result { margin-top: 20px; }
        pre { background: #f8f8f8; padding: 10px; border-radius: 5px; overflow: auto; }
      </style>
    </head>
    <body>
      <h1>Test Lit Protocol File Encryption & IPFS Upload</h1>
      <form id="uploadForm" enctype="multipart/form-data">
        <div class="form-group">
          <label for="file">Select File to Encrypt and Upload:</label>
          <input type="file" id="file" name="file" required>
        </div>
        <button type="submit">Encrypt & Upload</button>
      </form>
      <div id="result"></div>

      <script>
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
          e.preventDefault();

          const resultDiv = document.getElementById('result');
          resultDiv.innerHTML = '<p>Processing...</p>';

          const formData = new FormData();
          formData.append('file', document.getElementById('file').files[0]);

          try {
            const response = await fetch('/v1/lit/encrypt-upload', {
              method: 'POST',
              body: formData
            });

            const data = await response.json();
            resultDiv.innerHTML = '<h3>Result:</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
          } catch (error) {
            resultDiv.innerHTML = '<h3>Error:</h3><pre>' + error + '</pre>';
          }
        });
      </script>
    </body>
    </html>
  `;

  res.send(html);
});

module.exports = router;
