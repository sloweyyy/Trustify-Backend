// Test script for Private IPFS functionality
require('dotenv').config();

const { testPrivateIPFSUpload } = require('./src/config/blockchain');
const { PinataSDK } = require('pinata');

async function validateEnvironment() {
  console.log('🔍 Validating Environment Configuration...\n');

  const errors = [];

  // Check required environment variables
  if (!process.env.PINATA_JWT) {
    errors.push('❌ PINATA_JWT is missing');
  } else {
    const jwt = process.env.PINATA_JWT;
    console.log('✅ PINATA_JWT found (length:', jwt.length, ')');

    if (!jwt.startsWith('eyJ')) {
      errors.push('❌ PINATA_JWT format is invalid (should start with "eyJ")');
    } else {
      console.log('✅ JWT format appears valid');
    }
  }

  if (!process.env.PINATA_GATEWAY) {
    errors.push('❌ PINATA_GATEWAY is missing');
  } else {
    console.log('✅ PINATA_GATEWAY found:', process.env.PINATA_GATEWAY);
  }

  if (errors.length > 0) {
    console.log('\n🚨 Environment Validation Failed:');
    errors.forEach((error) => console.log(' ', error));
    console.log('\n💡 Please check your .env file and PRIVATE_IPFS_SETUP.md for guidance');
    return false;
  }

  return true;
}

async function testAuthentication() {
  console.log('\n🔐 Testing Pinata Authentication...\n');

  try {
    const pinata = new PinataSDK({
      pinataJwt: process.env.PINATA_JWT,
      pinataGateway: process.env.PINATA_GATEWAY,
    });

    const authResult = await pinata.testAuthentication();
    console.log('✅ Authentication successful:', authResult);
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);

    if (error.message.includes('401') || error.message.includes('Not Authorized')) {
      console.log('\n💡 Troubleshooting Tips:');
      console.log('- Check if your JWT token is correct and not expired');
      console.log('- Verify your Pinata account has private gateway access');
      console.log('- Ensure the JWT has the required permissions');
    }

    return false;
  }
}

async function runPrivateIPFSTest() {
  console.log('🚀 Private IPFS Test Suite\n');
  console.log('='.repeat(50));

  // Step 1: Validate environment
  const envValid = await validateEnvironment();
  if (!envValid) {
    process.exit(1);
  }

  // Step 2: Test authentication
  const authValid = await testAuthentication();
  if (!authValid) {
    process.exit(1);
  }

  // Step 3: Test private IPFS upload
  console.log('\n📤 Testing Private IPFS Upload...\n');

  try {
    const result = await testPrivateIPFSUpload();

    console.log('\n🎉 Private IPFS Test Completed Successfully!');
    console.log('='.repeat(50));
    console.log('📋 Test Results Summary:');
    console.log('📄 File CID:', result.fileCid);
    console.log('📋 Metadata CID:', result.metadataCid);
    console.log('🔗 File Access Link:', result.fileAccessLink);
    console.log('🔗 Metadata Access Link:', result.metadataAccessLink);
    console.log('🔒 Private:', result.isPrivate);
    console.log('⏰ Access links expire in 10 seconds for security');

    console.log('\n✨ You can now use private IPFS in your application!');
  } catch (error) {
    console.error('\n❌ Private IPFS Upload Test Failed:');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the test suite
runPrivateIPFSTest();
