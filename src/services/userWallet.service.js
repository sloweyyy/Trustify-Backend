const httpStatus = require('http-status');
const { UserWallet, User, Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const { emailService } = require('./index');
const { payOS } = require('../config/payos');

const generateOrderCode = () => {
  const MAX_SAFE_INTEGER = 9007199254740991;
  const MAX_ORDER_CODE = Math.floor(MAX_SAFE_INTEGER / 10);

  return Math.floor(Math.random() * MAX_ORDER_CODE) + 1;
};

/**
 * Adds an NFT to the user's wallet.
 *
 * @param {ObjectId} userId - The ID of the user.
 * @param {Object} nftData - The NFT data to be added.
 * @param {string} nftData.mintAddress - The mint address of the Solana NFT.
 * @param {string} [nftData.metadataAddress] - The metadata account address of the NFT.
 * @param {string} [nftData.transactionSignature] - The transaction signature (for Solana).
 * @param {string} [nftData.programId] - The program ID used to mint the NFT.
 * @param {string} nftData.filename - The filename of the NFT.
 * @param {string} nftData.metadataUri - The URI containing metadata of the NFT.
 * @param {number} [nftData.amount=1] - The number of copies of this NFT.
 * @param {string} [nftData.owner] - The current owner of the NFT.
 * @param {string} [nftData.explorerLink] - Link to view the NFT on Solana Explorer.
 * @param {string} [nftData.solscanLink] - Link to view the NFT on Solscan.
 * @param {string} [nftData.ipfsLink] - Link to view the NFT content on IPFS gateway.
 * @returns {Promise<UserWallet>} - The updated user wallet.
 * @throws {ApiError} - If the operation fails.
 */
const addNFTToWallet = async (userId, nftData) => {
  try {
    let userWallet = await UserWallet.findOne({ user: userId });

    if (!userWallet) {
      // If the user doesn't have a wallet, create one
      userWallet = new UserWallet({
        user: userId,
        nftItems: [nftData],
      });
    } else {
      // Check for duplicates by mint address
      const exists = userWallet.nftItems.some((item) => item.mintAddress === nftData.mintAddress);

      if (exists) {
        throw new ApiError(httpStatus.CONFLICT, `NFT with this mint address already exists in the wallet.`);
      }

      // Add the new NFT to the wallet
      userWallet.nftItems.push(nftData);
    }

    // Save the updated wallet
    await userWallet.save();
    return userWallet;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error adding NFT to wallet:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add NFT to wallet');
  }
};

const getWallet = async (userId) => {
  try {
    let userWallet = await UserWallet.findOne({ user: userId });

    if (!userWallet) {
      userWallet = new UserWallet({
        user: userId,
        nftItems: [],
      });
      await userWallet.save();
    }

    return userWallet;
  } catch (error) {
    console.error('Error getting user wallet:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to get user wallet');
  }
};

/**
 * Transfers a specific amount of an NFT from one user's wallet to another.
 *
 * @param {string} fromUserId - The ID of the user sending the NFT.
 * @param {string} toUserEmail - The ID of the user receiving the NFT.
 * @param {string} mintAddress - The mint address of the Solana NFT to transfer.
 * @param {number} amount - The number of NFT items to transfer.
 * @returns {Promise<void>}
 * @throws {ApiError} - If transfer fails.
 */
const transferNFT = async (fromUserId, toUserEmail, mintAddress, amount) => {
  try {
    // Validate amount
    if (amount <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Transfer amount must be greater than zero');
    }

    // Find sender's wallet
    const fromWallet = await UserWallet.findOne({ user: fromUserId });
    if (!fromWallet) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Sender wallet not found');
    }

    // Find the NFT in sender's wallet by mint address
    const nftItem = fromWallet.nftItems.find((item) => item.mintAddress === mintAddress);

    if (!nftItem) {
      throw new ApiError(httpStatus.NOT_FOUND, 'NFT not found in sender wallet');
    }

    if (nftItem.amount < amount) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient NFT amount to transfer');
    }

    nftItem.amount -= amount;
    await fromWallet.save();

    // Find recipient user by email
    const toUser = await User.findOne({ email: toUserEmail });
    if (!toUser) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Recipient user not found');
    }

    let toWallet = await UserWallet.findOne({ user: toUser._id });
    if (!toWallet) {
      toWallet = new UserWallet({
        user: toUser._id,
        nftItems: [{ ...nftItem.toObject(), amount }],
      });
    } else {
      const recipientNft = toWallet.nftItems.find((item) => item.mintAddress === mintAddress);

      if (recipientNft) {
        recipientNft.amount += amount;
      } else {
        toWallet.nftItems.push({ ...nftItem.toObject(), amount });
      }
    }

    // Send email to recipient
    await emailService.sendNFTTransferEmail(toUserEmail, nftItem.filename, amount);

    await toWallet.save();
  } catch (error) {
    console.error('Error transferring NFT:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to transfer NFT');
  }
};

/**
 * Decreases the amount of specified NFTs in the user's wallet.
 *
 * @param {ObjectId} userId - The ID of the user.
 * @param {Array<string>} fileIds - The list of file IDs whose amounts need to be decreased.
 * @returns {Promise<void>}
 * @throws {ApiError} - If the operation fails.
 */
const decreaseNFTAmount = async (userId, fileIds) => {
  try {
    const userWallet = await UserWallet.findOne({ user: userId });

    if (!userWallet) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User wallet not found');
    }

    fileIds.forEach((fileId) => {
      const nftItem = userWallet.nftItems.find((item) => item._id.toString() === fileId);
      if (nftItem) {
        if (nftItem.amount >= 1) {
          nftItem.amount -= 1;
        } else {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Cannot decrease amount for NFT with ID ${fileId} as it is less than or equal to 1`
          );
        }
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, `NFT with ID ${fileId} not found in user wallet`);
      }
    });

    await userWallet.save();
  } catch (error) {
    console.error('Error decreasing NFT amount:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to decrease NFT amount');
  }
};

const purchaseDocument = async (userId, itemId, amount) => {
  try {
    const userWallet = await UserWallet.findOne({ user: userId });

    if (!userWallet) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User wallet not found');
    }

    const user = await User.findById(userId);

    const document = userWallet.nftItems.find((item) => item._id.toString() === itemId);
    if (!document) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Document not found in user wallet');
    }

    const payment = new Payment({
      orderCode: generateOrderCode(),
      amount: amount * 2000,
      description: `Purchase NFT document`,
      returnUrl: `${process.env.CLIENT_URL}/user/document-wallet`,
      cancelUrl: `${process.env.SERVER_URL}/user/document-wallet`,
      userId: document.userId,
      documentId: itemId,
      serviceId: null,
      fieldId: null,
    });

    await payment.save();

    const paymentLinkResponse = await payOS.createPaymentLink({
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      returnUrl: payment.returnUrl,
      cancelUrl: payment.cancelUrl,
    });

    payment.checkoutUrl = paymentLinkResponse.checkoutUrl;
    await payment.save();

    await emailService.sendNFTPaymentEmail(user.email, document.filename, paymentLinkResponse);

    document.amount += amount;

    await userWallet.save();
  } catch (error) {
    console.error('Error purchasing document:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to purchase document');
  }
};

module.exports = {
  addNFTToWallet,
  getWallet,
  transferNFT,
  decreaseNFTAmount,
  purchaseDocument,
};
