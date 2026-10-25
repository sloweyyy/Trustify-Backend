const httpStatus = require('http-status');
const paymentService = require('../services/payment.service');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

// Only the payer or an admin may look at a payment. Others get 404 so ids can't be probed.
const getOwnPayment = async (req) => {
  const payment = await paymentService.getPaymentById(req.params.paymentId);
  if (req.user.role !== 'admin' && String(payment.userId) !== String(req.user.id)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  return payment;
};

const createPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.createPayment(req.body);
  res.status(httpStatus.CREATED).send(payment);
});

const getMyPayments = catchAsync(async (req, res) => {
  const payments = await paymentService.getPaymentsByUser(req.user.id, req.query.status);
  res.send(payments);
});

const getPayment = catchAsync(async (req, res) => {
  res.send(await getOwnPayment(req));
});

const handlePaymentCallback = catchAsync(async (req, res) => {
  const payment = await paymentService.handlePaymentCallback(req.params.orderCode, req.body.status);
  res.send(payment);
});

const getPaymentStatus = catchAsync(async (req, res) => {
  await getOwnPayment(req);
  const payment = await paymentService.getPaymentStatus(req.params.paymentId);
  res.send(payment);
});

const updateAllPayments = catchAsync(async (req, res) => {
  const payments = await paymentService.updateAllPayments();
  res.send(payments);
});

module.exports = {
  getMyPayments,
  createPayment,
  getPayment,
  handlePaymentCallback,
  getPaymentStatus,
  updateAllPayments,
};
