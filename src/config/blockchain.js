require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata, fetchDigitalAsset } = require('@metaplex-foundation/mpl-token-metadata');
const { keypairIdentity: umiKeypairIdentity } = require('@metaplex-foundation/umi');
const { fromWeb3JsKeypair } = require('@metaplex-foundation/umi-web3js-adapters');
const { Wallet } = require('@project-serum/anchor');
const PinataSDK = require('@pinata/sdk');
const { PinataSDK: NewPinataSDK } = require('pinata');
const { Readable } = require('stream');

const solanaClusterUrl = process.env.SOLANA_CLUSTER_URL || 'https://api.devnet.solana.com';
const connection = new Connection(solanaClusterUrl, 'confirmed');

let walletKeypair;
if (process.env.WALLET_PRIVATE_KEY) {
  try {
    const secretKey = Buffer.from(process.env.WALLET_PRIVATE_KEY, 'base64');

    if (secretKey.length !== 64) {
      throw new Error(`Secret key has length ${secretKey.length}, expected 64`);
    }

    walletKeypair = Keypair.fromSecretKey(secretKey);
    console.log('Using wallet from environment with public key:', walletKeypair.publicKey.toString());
  } catch (error) {
    console.error('Error loading wallet from environment:', error);
    console.warn('Falling back to random keypair');
    walletKeypair = Keypair.generate();
  }
} else {
  console.warn('Using a randomly generated keypair for development purposes');
  walletKeypair = Keypair.generate();
}

const wallet = new Wallet(walletKeypair);

const umi = createUmi(solanaClusterUrl);
const umiKeypair = fromWeb3JsKeypair(walletKeypair);
umi.use(umiKeypairIdentity(umiKeypair));
umi.use(mplTokenMetadata());

const extractIPFSCid = (url) => {
  if (!url) return null;

  if (url.includes('/ipfs/')) {
    const parts = url.split('/ipfs/');
    if (parts.length > 1) {
      return parts[1].split('?')[0];
    }
  }

  return null;
};

const getViewLinks = (mintAddress, metadataUri) => {
  const isDevnet = solanaClusterUrl.includes('devnet');
  const networkParam = isDevnet ? '?cluster=devnet' : '';

  const explorerLink = `https://explorer.solana.com/address/${mintAddress}${networkParam}`;
  const solscanLink = `https://solscan.io/token/${mintAddress}${isDevnet ? '?cluster=devnet' : ''}`;

  let ipfsLink = null;
  const ipfsCid = extractIPFSCid(metadataUri);
  if (ipfsCid) {
    ipfsLink = `https://gateway.pinata.cloud/ipfs/${ipfsCid}`;
  }

  return {
    explorerLink,
    solscanLink,
    ipfsLink,
    metadataUri,
  };
};

const pinata = new PinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);

// Initialize new Pinata SDK for private IPFS
const privatePinata = new NewPinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY || 'gateway.pinata.cloud',
});

// Function to upload file to private IPFS
const uploadToPrivateIPFS = async (fileBuffer, fileName) => {
  try {
    console.log(`Uploading file to Private IPFS: ${fileName}`);

    // Upload file to private IPFS
    const file = new File([fileBuffer], fileName, { type: 'application/octet-stream' });
    const fileUpload = await privatePinata.upload.private.file(file, {
      metadata: {
        name: fileName,
        description: `Private document: ${fileName}`,
      },
    });

    console.log(`File uploaded to Private IPFS with CID: ${fileUpload.cid}`);

    // Create metadata JSON for the file
    const metadataJson = {
      name: fileName,
      description: `Private Document: ${fileName}`,
      image: '',
      properties: {
        files: [
          {
            type: 'application/octet-stream',
            name: fileName,
            cid: fileUpload.cid,
          },
        ],
        isPrivate: true,
      },
    };

    // Upload metadata to private IPFS
    const metadataUpload = await privatePinata.upload.private.json(metadataJson, {
      metadata: {
        name: `${fileName}-metadata`,
        description: `Metadata for private document: ${fileName}`,
      },
    });

    console.log(`Metadata uploaded to Private IPFS with CID: ${metadataUpload.cid}`);

    return {
      fileCid: fileUpload.cid,
      metadataCid: metadataUpload.cid,
      metadataUri: `https://gateway.pinata.cloud/ipfs/${metadataUpload.cid}`,
      isPrivate: true,
    };
  } catch (error) {
    console.error('Error uploading to Private IPFS:', error);
    throw error;
  }
};

// Function to create a temporary access link for private files
const createPrivateAccessLink = async (cid, expiresInSeconds = 3600) => {
  try {
    console.log(`Creating access link for private file CID: ${cid}`);

    const accessLink = await privatePinata.gateways.private.createAccessLink({
      cid,
      expires: expiresInSeconds,
    });

    console.log(`Access link created: ${accessLink}`);
    return accessLink;
  } catch (error) {
    console.error('Error creating private access link:', error);
    throw error;
  }
};

// Function to test private IPFS upload with a sample file
const testPrivateIPFSUpload = async () => {
  try {
    console.log('Testing Private IPFS upload...');

    // Create a sample file buffer
    const sampleContent = JSON.stringify(
      {
        message: 'This is a test file for private IPFS',
        timestamp: new Date().toISOString(),
        testData: {
          user: 'test-user',
          document: 'sample-document.json',
        },
      },
      null,
      2
    );

    const fileBuffer = Buffer.from(sampleContent, 'utf8');
    const fileName = `test-private-${Date.now()}.json`;

    // Upload to private IPFS
    const uploadResult = await uploadToPrivateIPFS(fileBuffer, fileName);

    // Create access links for both file and metadata
    const fileAccessLink = await createPrivateAccessLink(uploadResult.fileCid, 10); // 10 seconds
    const metadataAccessLink = await createPrivateAccessLink(uploadResult.metadataCid, 10);

    console.log('Private IPFS Test Results:');
    console.log('File CID:', uploadResult.fileCid);
    console.log('Metadata CID:', uploadResult.metadataCid);
    console.log('File Access Link:', fileAccessLink);
    console.log('Metadata Access Link:', metadataAccessLink);

    return {
      ...uploadResult,
      fileAccessLink,
      metadataAccessLink,
    };
  } catch (error) {
    console.error('Error testing private IPFS upload:', error);
    throw error;
  }
};

const uploadToIPFS = async (fileBuffer, fileName) => {
  try {
    console.log(`Uploading file to IPFS: ${fileName}`);

    const metadataJson = {
      name: fileName,
      description: `Document: ${fileName}`,
      image: '',
      properties: {
        files: [
          {
            type: 'application/octet-stream',
            name: fileName,
          },
        ],
      },
    };

    const fileStream = Readable.from(fileBuffer);

    const fileResult = await pinata.pinFileToIPFS(fileStream, {
      pinataMetadata: {
        name: fileName,
      },
      pinataOptions: {
        cidVersion: 0,
      },
    });

    console.log(`File uploaded to IPFS with CID: ${fileResult.IpfsHash}`);

    const fileUrl = `https://gateway.pinata.cloud/ipfs/${fileResult.IpfsHash}`;
    metadataJson.properties.files[0].uri = fileUrl;

    const metadataResult = await pinata.pinJSONToIPFS(metadataJson, {
      pinataMetadata: {
        name: `${fileName}-metadata`,
      },
      pinataOptions: {
        cidVersion: 0,
      },
    });

    console.log(`Metadata uploaded to IPFS with CID: ${metadataResult.IpfsHash}`);

    return `https://gateway.pinata.cloud/ipfs/${metadataResult.IpfsHash}`;
  } catch (error) {
    console.error('Error uploading to IPFS via Pinata:', error);
    throw error;
  }
};

const mintDocumentNFT = async (metadataUri) => {
  try {
    const name = metadataUri.name || 'Document NFT';
    const symbol = 'DOC';

    const metaplex = Metaplex.make(connection).use(keypairIdentity(walletKeypair));

    console.log('Creating NFT using Metaplex JS SDK...');

    const { nft, response } = await metaplex.nfts().create({
      name,
      symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
    });

    const mintAddress = nft.address.toString();
    const metadataAddress = nft.metadataAddress.toString();
    const transactionSignature = response.signature;

    console.log('NFT minted successfully!');
    console.log('Mint Address:', mintAddress);
    console.log('Metadata Address:', metadataAddress);
    console.log('Transaction Signature:', transactionSignature);

    const viewLinks = getViewLinks(mintAddress, metadataUri);

    return {
      mintAddress,
      metadataAddress,
      transactionSignature,
      metadataUri,
      viewLinks,
    };
  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
};

const getTransactionData = async (signature) => {
  try {
    if (!signature || typeof signature !== 'string') {
      console.log('No transaction signature provided, returning minimal transaction data');
      return {
        transactionSignature: null,
        mintAddress: null,
        tokenId: null,
        tokenURI: '',
        slot: 0,
        timestamp: Math.floor(Date.now() / 1000),
        ageInSeconds: 0,
        ageInMinutes: 0,
        ageInHours: 0,
        ageInDays: 0,
        logs: [],
      };
    }

    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const blockTime = transaction.blockTime || currentTime;
    const ageInSeconds = currentTime - blockTime;
    const ageInMinutes = Math.floor(ageInSeconds / 60);
    const ageInHours = Math.floor(ageInMinutes / 60);
    const ageInDays = Math.floor(ageInHours / 24);

    let mintAddress = null;
    if (transaction.meta && transaction.meta.logMessages) {
      const mintLog = transaction.meta.logMessages.find((log) => log && log.includes('mint_address'));
      if (mintLog) {
        const splitResult = mintLog.split(':');
        if (splitResult.length > 1) {
          mintAddress = splitResult[1].trim();
        }
      }
    }

    let tokenURI = '';
    if (mintAddress) {
      try {
        const asset = await fetchDigitalAsset(umi, mintAddress);
        tokenURI = asset.metadata.uri;
      } catch (err) {
        console.warn('Could not fetch digital asset metadata:', err);
      }
    }

    const transactionData = {
      transactionSignature: signature,
      mintAddress: mintAddress || null,
      tokenId: mintAddress || null,
      tokenURI,
      slot: transaction.slot,
      timestamp: blockTime,
      ageInSeconds,
      ageInMinutes,
      ageInHours,
      ageInDays,
      logs: (transaction.meta && transaction.meta.logMessages) || [],
    };

    return transactionData;
  } catch (error) {
    console.error('Error fetching transaction data:', error);
    throw error;
  }
};

const getMetadataByMint = async (mintAddress) => {
  try {
    if (!mintAddress) {
      throw new Error('Mint address is required');
    }

    console.log(`Fetching metadata for mint address: ${mintAddress}`);

    const asset = await fetchDigitalAsset(umi, mintAddress);

    const metadataUri = asset.metadata.uri;

    let metadataContent = null;
    if (metadataUri) {
      try {
        const response = await fetch(metadataUri);
        if (response.ok) {
          metadataContent = await response.json();
        }
      } catch (error) {
        console.warn(`Failed to fetch metadata content from ${metadataUri}:`, error);
      }
    }

    const viewLinks = getViewLinks(mintAddress, metadataUri);

    return {
      mintAddress,
      onChainMetadata: {
        name: asset.metadata.name,
        symbol: asset.metadata.symbol,
        uri: asset.metadata.uri,
        sellerFeeBasisPoints: asset.metadata.sellerFeeBasisPoints,
        creators: asset.metadata.creators,
        collection: asset.metadata.collection,
        uses: asset.metadata.uses,
      },
      offChainMetadata: metadataContent,
      viewLinks,
      updateAuthority: asset.authority,
      isMutable: asset.metadata.isMutable,
    };
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    throw error;
  }
};

module.exports = {
  connection,
  wallet,
  umi,
  uploadToIPFS,
  mintDocumentNFT,
  getTransactionData,
  pinata,
  getViewLinks,
  extractIPFSCid,
  getMetadataByMint,
  uploadToPrivateIPFS,
  testPrivateIPFSUpload,
  createPrivateAccessLink,
};
