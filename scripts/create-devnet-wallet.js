require('dotenv').config();
const { Keypair, Connection, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');

async function createDevnetWallet() {
  try {
    console.log('Generating a new Solana devnet wallet...');

    // Create a new random keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();

    // Save the raw secret key bytes
    const privateKeyRaw = Buffer.from(keypair.secretKey);

    // Save wallet info to a local file (not to be committed to git)
    const walletInfo = {
      publicKey,
      privateKey: privateKeyRaw.toString('base64'),
      secretKeyLength: privateKeyRaw.length,
    };

    fs.writeFileSync('.devnet-wallet.json', JSON.stringify(walletInfo, null, 2));
    console.log('Wallet created and saved to .devnet-wallet.json');
    console.log('Public Key:', publicKey);
    console.log('Secret Key Length:', privateKeyRaw.length, 'bytes');

    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

    // Request airdrop
    console.log('Requesting airdrop of 2 SOL from devnet...');
    const signature = await connection.requestAirdrop(keypair.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature);

    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Wallet funded with ${balance / LAMPORTS_PER_SOL} SOL`);

    // Display instructions
    console.log('\n===== SETUP INSTRUCTIONS =====');
    console.log('1. Add this to your .env file:');
    console.log(`WALLET_PRIVATE_KEY=${privateKeyRaw.toString('base64')}`);
    console.log('\n2. To use with devnet:');
    console.log('NODE_ENV=production');
    console.log('SOLANA_CLUSTER_URL=https://api.devnet.solana.com');
    console.log('BUNDLR_NODE=https://devnet.bundlr.network');
    console.log('BUNDLR_CURRENCY=solana');
    console.log('\n3. Fund your Bundlr account:');
    console.log('This will happen automatically when you run your app with the above configuration.');
    console.log('\nIMPORTANT: Keep your private key secure and do not commit it to version control!');
    console.log('============================');
  } catch (error) {
    console.error('Error creating devnet wallet:', error);
  }
}

createDevnetWallet();
