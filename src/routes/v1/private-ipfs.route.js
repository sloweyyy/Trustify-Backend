const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const privateIpfsValidation = require('../../validations/private-ipfs.validation');
const privateIpfsController = require('../../controllers/private-ipfs.controller');

const router = express.Router();

router
  .route('/access-link')
  .post(auth(), validate(privateIpfsValidation.createAccessLink), privateIpfsController.createAccessLink);

module.exports = router;
