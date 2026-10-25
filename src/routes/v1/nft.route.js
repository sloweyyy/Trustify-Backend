const express = require('express');
const nftController = require('../../controllers/nft.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: NFT
 *   description: NFT metadata operations
 */

/**
 * @swagger
 * /nft/metadata/{mintAddress}:
 *   get:
 *     summary: Get NFT metadata by mint address
 *     description: Fetches complete metadata for an NFT using its mint address, including both on-chain and off-chain data.
 *     tags: [NFT]
 *     parameters:
 *       - in: path
 *         name: mintAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: Mint address of the NFT
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mintAddress:
 *                   type: string
 *                   description: The mint address of the NFT
 *                 onChainMetadata:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     symbol:
 *                       type: string
 *                     uri:
 *                       type: string
 *                     sellerFeeBasisPoints:
 *                       type: number
 *                     creators:
 *                       type: array
 *                     collection:
 *                       type: object
 *                     uses:
 *                       type: object
 *                 offChainMetadata:
 *                   type: object
 *                   description: The full metadata content fetched from the URI
 *                 viewLinks:
 *                   type: object
 *                   properties:
 *                     explorerLink:
 *                       type: string
 *                     solscanLink:
 *                       type: string
 *                     ipfsLink:
 *                       type: string
 *                     metadataUri:
 *                       type: string
 *                 updateAuthority:
 *                   type: string
 *                 isMutable:
 *                   type: boolean
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "500":
 *         $ref: '#/components/responses/InternalServerError'
 */

router.route('/metadata/:mintAddress').get(nftController.getNFTMetadata);
router.route('/verify-file').post(upload.single('file'), nftController.verifyFile);

/**
 * @swagger
 * /nft/verify-file:
 *   post:
 *     summary: Check a file against a notarization record
 *     description: Hashes the uploaded file (SHA-256, in memory only) and compares it with the fingerprint stored in the NFT's public metadata. `match` is null for legacy records that have no fingerprint.
 *     tags: [NFT]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [mintAddress, file]
 *             properties:
 *               mintAddress:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       "200":
 *         description: Comparison result
 *       "400":
 *         description: Missing file or mint address, or file type not allowed
 *       "404":
 *         description: No record for this mint address
 */

module.exports = router;
