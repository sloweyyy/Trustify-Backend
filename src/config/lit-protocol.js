const { LitNodeClient } = require('@lit-protocol/lit-node-client');
const { LIT_NETWORK } = require('@lit-protocol/constants');
const { Keypair } = require('@solana/web3.js');
const tweetnacl = require('tweetnacl');

// Create a client connecting to the Lit Network
const litNodeClient = new LitNodeClient({
  litNetwork: LIT_NETWORK.DatilDev, // Use DatilDev for testing
  debug: false,
});

let isConnected = false;

/**
 * Ensure the Lit client is connected
 */
async function ensureLitConnected() {
  if (!isConnected) {
    await litNodeClient.connect();
    isConnected = true;
  }
}

/**
 * Get Unified Access Control Conditions for Solana wallet address
 * This controls who can decrypt the file
 */
function getUnifiedAccessControlConditions() {
  const walletAddress = process.env.AUTHORIZED_WALLET_ADDRESS;

  return [
    {
      conditionType: 'solRpc',
      method: 'getBalance',
      params: [walletAddress],
      chain: 'solana',
      pdaParams: [], // required
      pdaInterface: {
        offset: 0, // required
        fields: {}, // required (empty object is fine)
      },
      pdaKey: walletAddress, // must be here
      returnValueTest: {
        key: '', // required (empty string works)
        comparator: '>=',
        value: '0',
      },
    },
  ];
}

/**
 * Generate a Lit Protocol compatible auth signature for Solana
 */
async function generateAuthSig() {
  const walletAddress = process.env.AUTHORIZED_WALLET_ADDRESS;
  const message = `I am creating an account to use Lit Protocol at ${new Date().toISOString()}`;

  // Create a message to sign
  const messageBytes = new TextEncoder().encode(message);

  // Get the wallet keypair from environment
  const secretKey = Buffer.from(process.env.WALLET_PRIVATE_KEY, 'base64');
  const keypair = Keypair.fromSecretKey(secretKey);

  // Sign the message using tweetnacl with the keypair's secret key
  const signatureBytes = tweetnacl.sign.detached(messageBytes, keypair.secretKey);

  // Convert signature to base64
  const signatureBase64 = Buffer.from(signatureBytes).toString('base64');

  return {
    sig: signatureBase64,
    derivedVia: 'solana.signMessage',
    signedMessage: message,
    address: walletAddress,
  };
}

/**
 * Encrypt a file using Lit Protocol with Solana
 * @param {Buffer} fileBuffer - File to encrypt
 * @returns {Promise<Object>} Encrypted file, key, and access conditions
 */
async function encryptFileWithLit(fileBuffer) {
  await ensureLitConnected();
  const accessControlConditions = getUnifiedAccessControlConditions();
  const authSig = await generateAuthSig();

  try {
    const { ciphertext, dataToEncryptHash } = await litNodeClient.encrypt({
      unifiedAccessControlConditions: accessControlConditions,
      authSig,
      chain: 'solana',
      dataToEncrypt: fileBuffer,
    });

    return {
      encryptedFile: ciphertext,
      encryptedSymmetricKey: dataToEncryptHash,
      unifiedAccessControlConditions: accessControlConditions,
    };
  } catch (error) {
    console.error('Solana encryption failed:', error);
    throw error;
  }
}

/**
 * Decrypt a file using Lit Protocol with Solana
 * @param {string} encryptedFile - Encrypted file data (ciphertext)
 * @param {string} encryptedSymmetricKey - Encrypted symmetric key hash
 * @param {Array} conditions - Unified access control conditions
 * @returns {Promise<Buffer>} Decrypted file data
 */
async function decryptFileWithLit(encryptedFile, encryptedSymmetricKey, conditions) {
  await ensureLitConnected();
  const authSig = await generateAuthSig();

  try {
    const decryptedBuffer = await litNodeClient.decrypt({
      unifiedAccessControlConditions: conditions,
      authSig,
      chain: 'solana',
      ciphertext: encryptedFile,
      dataToEncryptHash: encryptedSymmetricKey,
    });

    return Buffer.isBuffer(decryptedBuffer) ? decryptedBuffer : Buffer.from(decryptedBuffer);
  } catch (error) {
    console.error('Solana decryption failed:', error);
    throw error;
  }
}

module.exports = {
  litNodeClient,
  encryptFileWithLit,
  decryptFileWithLit,
  getUnifiedAccessControlConditions,
  generateAuthSig,
};
