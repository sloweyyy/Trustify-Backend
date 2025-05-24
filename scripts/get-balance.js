require('dotenv').config();
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');

async function getWalletBalance() {
  try {
    // Read wallet info from file
    const walletInfo = JSON.parse(fs.readFileSync('.devnet-wallet.json', 'utf8'));
    const publicKey = new PublicKey(walletInfo.publicKey);

    // Connect to devnet
    const solanaClusterUrl = process.env.SOLANA_CLUSTER_URL;
    const connection = new Connection(solanaClusterUrl, 'confirmed');

    // Get balance
    const balance = await connection.getBalance(publicKey);
    console.log(`Wallet Address: ${publicKey.toString()}`);
    console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  } catch (error) {
    console.error('Error getting wallet balance:', error);
  }
}

getWalletBalance();
