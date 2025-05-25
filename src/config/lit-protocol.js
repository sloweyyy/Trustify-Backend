const { LitNodeClient } = require('@lit-protocol/lit-node-client');
const { LIT_NETWORK } = require('@lit-protocol/constants');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

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
  // Use a fixed message without timestamp for consistent signatures
  const message = 'I am signing this message to authenticate with Lit Protocol';
  const messageBytes = new TextEncoder().encode(message);

  // Get the wallet keypair from environment
  const secretKey = Buffer.from(process.env.WALLET_PRIVATE_KEY, 'base64');
  const keypair = Keypair.fromSecretKey(secretKey);

  // Create a detached Ed25519 signature using tweetnacl
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);

  // Base58-encode the signature
  const sigBase58 = bs58.encode(signatureBytes);

  return {
    sig: sigBase58,
    derivedVia: 'solana.signMessage',
    signedMessage: message,
    address: walletAddress,
    // Add required fields for Solana auth sig
    algo: 'ed25519',
    format: 'base58', // Explicitly specify format
  };
}

/**
 * Encrypt a file using Lit Protocol with Solana
 * @param {Buffer} fileBuffer - File to encrypt
 * @param {Object} authSig - Authentication signature object
 * @returns {Promise<Object>} Encrypted file, key, and access conditions
 */
async function encryptFileWithLit(fileBuffer, authSig) {
  await ensureLitConnected();
  const accessControlConditions = getUnifiedAccessControlConditions();

  try {
    // Format auth signature for encryption too
    const formattedAuthSig = { solana: authSig };

    console.log(
      'Using formatted auth signature for encryption:',
      JSON.stringify({ solana: { ...authSig, sig: authSig.sig.substring(0, 10) + '...' } }, null, 2)
    );

    const { ciphertext, dataToEncryptHash } = await litNodeClient.encrypt({
      unifiedAccessControlConditions: accessControlConditions,
      authSig: formattedAuthSig,
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
 * @param {Uint8Array|string} encryptedFile - Encrypted file data (ciphertext)
 * @param {string} encryptedSymmetricKey - Encrypted symmetric key hash
 * @param {Array} conditions - Unified access control conditions
 * @param {Object} authSig - Authentication signature object
 * @returns {Promise<Buffer>} Decrypted file data
 */
async function decryptFileWithLit(encryptedFile, encryptedSymmetricKey, conditions, authSig) {
  await ensureLitConnected();

  try {
    // Wrap the authSig for Solana
    const formattedAuthSig = { solana: authSig };

    // Print only the first 10 chars of sig for debug
    const debugSig = authSig.sig ? `${authSig.sig.slice(0, 10)}...` : '';
    console.log(
      'Using formatted auth signature for decryption:',
      JSON.stringify({ solana: { ...authSig, sig: debugSig } }, null, 2)
    );

    // Ensure ciphertext is properly formatted (Uint8Array or string)
    let ciphertext = encryptedFile;
    if (Buffer.isBuffer(encryptedFile)) {
      ciphertext = new Uint8Array(encryptedFile);
    }

    // Log parameters for debugging
    console.log('Decryption parameters:', {
      conditionsLength: conditions.length,
      dataToEncryptHashType: typeof encryptedSymmetricKey,
      ciphertextType: typeof ciphertext,
      ciphertextIsArray: Array.isArray(ciphertext),
      ciphertextIsUint8Array: ciphertext instanceof Uint8Array,
      ciphertextLength: ciphertext.length || 'unknown',
    });

    // Use exact parameter names as specified in Lit Protocol docs
    console.log('Sending decrypt request with parameters:', {
      symmetricKeyConditions: conditions,
      authSig: 'formattedAuthSig', // Not printing actual auth sig
      chain: 'solana',
      symmetricKeyToDecrypt: encryptedSymmetricKey.substring(0, 20) + '...',
    });

    const decryptedBuffer = await litNodeClient.decrypt({
      symmetricKey: encryptedSymmetricKey,
      unifiedAccessControlConditions: conditions,
      authSig: formattedAuthSig,
      chain: 'solana',
      dataToDecrypt: ciphertext,
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
