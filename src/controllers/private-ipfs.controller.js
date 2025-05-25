const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { privateIpfsService } = require('../services');
const ApiError = require('../utils/ApiError');

const createAccessLink = catchAsync(async (req, res) => {
  const { cid } = req.body;
  if (!cid) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'CID is required');
  }

  const accessLink = await privateIpfsService.createNewAccessLink(cid);
  res.status(httpStatus.OK).send({ accessLink });
});

module.exports = {
  createAccessLink,
};
