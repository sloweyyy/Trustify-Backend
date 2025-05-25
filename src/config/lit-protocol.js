const { LitNodeClient, getEncryptionKey } = require('@lit-protocol/lit-node-client');
const { LIT_NETWORK } = require('@lit-protocol/constants');
const crypto = require('crypto');

const litNodeClient = new LitNodeClient({
  litNetwork: LIT_NETWORK.DatilDev,
  debug: false,
});

let isConnected = false;

async function ensureLitConnected() {
  if (!isConnected) {
    await litNodeClient.connect();
    isConnected = true;
  }
}

function getAccessControlConditions() {
  const walletAddress = '5XtnVExyUMkC4nRoc1Ru7bvFryv6XdVyr8wfkCEHm3ts';
  const programId = process.env.PROGRAM_ID;
  if (programId) {
    // Example: Only allow if the user is the authority of the program (customize as needed)
    return [
      {
        contractAddress: programId,
        standardContractType: '',
        chain: 'solana',
        method: '',
        parameters: [':userAddress'],
        returnValueTest: {
          comparator: '=',
          value: walletAddress,
        },
      },
    ];
  }
  // Default: Only allow the app's wallet address
  return [
    {
      contractAddress: '',
      standardContractType: '',
      chain: 'solana',
      method: '',
      parameters: [':userAddress'],
      returnValueTest: {
        comparator: '=',
        value: walletAddress,
      },
    },
  ];
}

function encryptFile({ file }) {
  const algorithm = 'aes-256-gcm';
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(file), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Store iv and tag with the encrypted file for decryption
  const encryptedFile = Buffer.concat([iv, tag, encrypted]);
  return { encryptedFile, symmetricKey: key };
}

/**
 * Encrypt a file buffer with Lit Protocol and return the encrypted file, encrypted symmetric key, and access control conditions.
 * Uses the app's wallet address as the only allowed decryptor.
 */
async function encryptFileWithLit(fileBuffer, chain = 'solana') {
  await ensureLitConnected();
  const accessControlConditions = getAccessControlConditions();
  // Encrypt the file
  const { encryptedFile, symmetricKey } = await encryptFile({ file: fileBuffer });

  // Save the symmetric key with Lit, using access control
  const encryptedSymmetricKey = await litNodeClient.saveEncryptionKey({
    accessControlConditions,
    symmetricKey,
    chain,
    litNodeClient,
  });

  return {
    encryptedFile,
    encryptedSymmetricKey,
    accessControlConditions,
  };
}

/**
 * Decrypt a file buffer with Lit Protocol using the encrypted symmetric key and access control conditions.
 * @param {Blob|Buffer} encryptedFile - The encrypted file buffer or blob.
 * @param {string} encryptedSymmetricKey - The encrypted symmetric key from Lit.
 * @param {string} chain - The blockchain (e.g., 'solana').
 * @param {Object} authSig - The authentication signature (from the user's wallet).
 * @returns {Promise<Buffer>} - The decrypted file buffer.
 */
async function decryptFileWithLit(encryptedFile, encryptedSymmetricKey, chain = 'solana', authSig) {
  await ensureLitConnected();
  const accessControlConditions = getAccessControlConditions();
  // Get the symmetric key from Lit
  const symmetricKey = await getEncryptionKey({
    accessControlConditions,
    toDecrypt: encryptedSymmetricKey,
    chain,
    authSig,
    litNodeClient,
  });
  return symmetricKey;
}

module.exports = {
  litNodeClient,
  encryptFileWithLit,
  decryptFileWithLit,
};
