const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const userWalletSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    nftItems: [
      {
        mintAddress: {
          type: String,
          required: true,
          trim: true,
          description: 'The mint address of the NFT (primary identifier on Solana)',
        },
        metadataAddress: {
          type: String,
          required: false,
          trim: true,
          description: 'The metadata address associated with this NFT',
        },
        transactionSignature: {
          type: String,
          required: false,
          trim: true,
          default: null,
          description: 'The signature of the transaction that minted this NFT',
        },
        programId: {
          type: String,
          required: false,
          trim: true,
          default: null,
          description: 'The Solana program ID that created the NFT',
        },
        filename: {
          type: String,
          required: true,
          trim: true,
          description: 'Original document filename',
        },
        metadataUri: {
          type: String,
          required: true,
          trim: true,
          description: 'IPFS URI to the NFT metadata',
        },
        amount: {
          type: Number,
          required: true,
          default: 1,
          description: 'Number of copies of this NFT owned',
        },
        owner: {
          type: String,
          required: false,
          trim: true,
          description: 'Public key of the current owner of the NFT',
        },
        mintedAt: {
          type: Date,
          default: Date.now,
          description: 'When the NFT was minted',
        },
        explorerLink: {
          type: String,
          required: false,
          trim: true,
          description: 'Link to view the NFT on Solana Explorer',
        },
        solscanLink: {
          type: String,
          required: false,
          trim: true,
          description: 'Link to view the NFT on Solscan',
        },
        ipfsLink: {
          type: String,
          required: false,
          trim: true,
          description: 'Link to view the NFT content on IPFS gateway',
        },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

userWalletSchema.index({ 'nftItems.mintAddress': 1 }, { sparse: true });

userWalletSchema.plugin(toJSON);
userWalletSchema.plugin(paginate);

const UserWallet = mongoose.model('UserWallet', userWalletSchema);

module.exports = UserWallet;
