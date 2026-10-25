require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata, fetchDigitalAsset } = require('@metaplex-foundation/mpl-token-metadata');
const { keypairIdentity: umiKeypairIdentity } = require('@metaplex-foundation/umi');
const { fromWeb3JsKeypair } = require('@metaplex-foundation/umi-web3js-adapters');
const { Wallet } = require('@project-serum/anchor');
const PinataSDK = require('@pinata/sdk');

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

const pinataEnabled = Boolean(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY);
const pinata = pinataEnabled ? new PinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY) : null;

const METADATA_FOLDER = 'nft-metadata';
const HASH_ALGORITHM = 'SHA-256';

// Files reused from a document wallet: legacy metadata links, or a notarized output in private storage.
const isNotarizedAssetUrl = (url) =>
  Boolean(url) && (url.includes('/ipfs/') || url.includes(`/${METADATA_FOLDER}/`) || url.startsWith('storage://outputs/'));

/**
 * Public NFT metadata for a notarized document. It carries a SHA-256 fingerprint
 * of the file and nothing personal: no file, file name or link to the file, which
 * stays in private storage. Anyone holding the file can check it against this record.
 */
const buildDocumentMetadata = (fileHash, notarizedAt = new Date()) => ({
  name: 'Trustify Notarized Doc',
  symbol: 'DOC',
  description:
    'Bản ghi công chứng Trustify. Tài liệu được lưu riêng tư; đối chiếu bằng cách so mã băm SHA-256 của tệp với bản ghi này.',
  attributes: [
    { trait_type: 'issuer', value: 'Trustify' },
    { trait_type: 'hash_algorithm', value: HASH_ALGORITHM },
    { trait_type: 'sha256', value: fileHash },
    { trait_type: 'notarized_at', value: notarizedAt.toISOString() },
  ],
  properties: {
    issuer: 'Trustify',
    hashAlgorithm: HASH_ALGORITHM,
    sha256: fileHash,
    notarizedAt: notarizedAt.toISOString(),
  },
});

/** Read the recorded fingerprint from metadata, or null for legacy records without one. */
const getRecordedHash = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return null;
  const fromProperties = metadata.properties && metadata.properties.sha256;
  const fromAttributes = Array.isArray(metadata.attributes)
    ? (metadata.attributes.find((attribute) => attribute.trait_type === 'sha256') || {}).value
    : null;
  const hash = fromProperties || fromAttributes;
  return typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : null;
};

/**
 * Publish the public record for a notarized file and return its metadata URI:
 * pinned to IPFS when Pinata is configured, otherwise stored in public file storage.
 * Returns { metadataUri, sha256 }.
 */
const publishDocumentRecord = async (fileBuffer, { notarizedAt = new Date() } = {}) => {
  // Lazy require: storage pulls in firebase/logger, which this module must not depend on at load time.
  // eslint-disable-next-line global-require
  const { uploadFile, sha256 } = require('./storage');
  const fileHash = sha256(fileBuffer);
  const metadata = buildDocumentMetadata(fileHash, notarizedAt);

  if (pinataEnabled) {
    const result = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: { name: `trustify-record-${fileHash.slice(0, 16)}` },
      pinataOptions: { cidVersion: 0 },
    });
    return { metadataUri: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`, sha256: fileHash };
  }

  const metadataUri = await uploadFile(
    `${METADATA_FOLDER}/${Date.now()}-${fileHash.slice(0, 16)}/metadata.json`,
    Buffer.from(JSON.stringify(metadata)),
    'application/json',
    { visibility: 'public' }
  );
  return { metadataUri, sha256: fileHash };
};

const mintDocumentNFT = async (metadataUri) => {
  try {
    const name = 'Trustify Notarized Doc';
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
  mintDocumentNFT,
  getTransactionData,
  pinata,
  isNotarizedAssetUrl,
  buildDocumentMetadata,
  getRecordedHash,
  publishDocumentRecord,
  getViewLinks,
  extractIPFSCid,
  getMetadataByMint,
};
