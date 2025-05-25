/**
 * Test script for Lit Protocol integration with Solana
 *
 * This script demonstrates:
 * 1. Encrypting a test file with Lit Protocol using Solana
 * 2. Uploading the encrypted file to IPFS via Pinata
 * 3. Decrypting the file using the encrypted symmetric key and access control conditions
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { encryptFileWithLit, decryptFileWithLit } = require('../config/lit-protocol');
const { uploadToIPFS } = require('../config/blockchain-test');

async function testLitProtocol() {
  try {
    console.log('=== Lit Protocol Test with Solana ===');

    // Create a test file with some content
    const testContent = 'This is a test file for Lit Protocol encryption with Solana';
    const testFileName = 'test-lit-file.txt';
    const testFilePath = path.join(__dirname, testFileName);

    fs.writeFileSync(testFilePath, testContent);
    console.log(`Created test file: ${testFilePath}`);

    // Read the file as a buffer and convert to Uint8Array for Lit Protocol
    const fileBuffer = fs.readFileSync(testFilePath);
    const uint8Array = new Uint8Array(fileBuffer);
    console.log('File read as Uint8Array');

    // Step 1: Encrypt the file with Lit Protocol using Solana
    console.log('Encrypting file with Lit Protocol using Solana...');
    const encryptedResult = await encryptFileWithLit(uint8Array);
    const { encryptedFile, encryptedSymmetricKey, unifiedAccessControlConditions } = encryptedResult;

    // Save encrypted file for testing
    const encryptedFilePath = path.join(__dirname, `encrypted-${testFileName}`);
    fs.writeFileSync(encryptedFilePath, encryptedFile);
    console.log(`Saved encrypted file: ${encryptedFilePath}`);

    // Step 2: Upload to IPFS
    console.log('Uploading to IPFS...');
    const metadataUri = await uploadToIPFS(encryptedFile, testFileName, true);
    console.log('Uploaded to IPFS with URI:', metadataUri);

    // Step 3: Decrypt the file
    console.log('Decrypting file...');
    const decryptedFile = await decryptFileWithLit(encryptedFile, encryptedSymmetricKey, unifiedAccessControlConditions);

    // Save decrypted file
    const decryptedFilePath = path.join(__dirname, `decrypted-${testFileName}`);
    fs.writeFileSync(decryptedFilePath, decryptedFile);
    console.log(`Saved decrypted file: ${decryptedFilePath}`);

    // Verify content
    const decryptedContent = decryptedFile.toString();
    console.log('Decrypted content:', decryptedContent);
    console.log('Original content:', testContent);
    console.log('Decryption successful:', decryptedContent === testContent);
    console.log('Used conditions:', JSON.stringify(unifiedAccessControlConditions, null, 2));
    console.log('=== Test Complete ===');
  } catch (error) {
    console.error('Error in Lit Protocol test:', error);
  }
}

// Run the test
testLitProtocol();
