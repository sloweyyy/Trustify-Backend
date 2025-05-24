require('dotenv').config();
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');

async function requestAirdrop() {
  try {
    // Read wallet info from file
    const walletInfo = JSON.parse(fs.readFileSync('.devnet-wallet.json', 'utf8'));
    const publicKey = new PublicKey(walletInfo.publicKey);

    // Connect to devnet
    const solanaClusterUrl = process.env.SOLANA_CLUSTER_URL;
    const connection = new Connection(solanaClusterUrl, 'confirmed');

    // Request airdrop
    console.log('Requesting airdrop of 5 SOL...');
    const signature = await connection.requestAirdrop(publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature });

    // Check new balance
    const balance = await connection.getBalance(publicKey);
    console.log(`Wallet Address: ${publicKey.toString()}`);
    console.log(`New Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  } catch (error) {
    console.error('Error requesting airdrop:', error);
  }
}

requestAirdrop();
