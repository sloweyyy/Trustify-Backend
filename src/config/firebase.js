/**
 * Firebase is optional. When FIREBASE_PRIVATE_KEY is not set, every export is null
 * and callers fall back to other storage (see config/storage.js).
 */
const admin = require('firebase-admin');
require('dotenv').config();

const enabled = Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID);

let db = null;
let auth = null;
let bucket = null;
let downloadFile = null;

if (enabled) {
  const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
    authUri: process.env.FIREBASE_AUTH_URI,
    tokenUri: process.env.FIREBASE_TOKEN_URI,
    authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universeDomain: process.env.FIREBASE_UNIVERSE_DOMAIN,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  db = process.env.FIREBASE_DATABASE_URL ? admin.database() : null;
  auth = admin.auth();
  bucket = process.env.FIREBASE_STORAGE_BUCKET ? admin.storage().bucket() : null;

  downloadFile = async (fileUrl) => {
    const urlParts = fileUrl.split('/');
    const filePath = decodeURIComponent(urlParts.slice(4).join('/'));
    const data = await bucket.file(filePath).download();
    return data[0];
  };
}

module.exports = { enabled, db, auth, bucket, downloadFile };
