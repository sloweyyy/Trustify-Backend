const httpStatus = require('http-status');
const paymentService = require('../services/payment.service');
const catchAsync = require('../utils/catchAsync');

const createPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.createPayment(req.body);
  res.status(httpStatus.CREATED).send(payment);
});

const getPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentById(req.params.paymentId);
  res.send(payment);
});

const handlePaymentCallback = catchAsync(async (req, res) => {
  const payment = await paymentService.handlePaymentCallback(req.params.orderCode, req.body.status);
  res.send(payment);
});

const getPaymentStatus = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentStatus(req.params.paymentId);
  res.send(payment);
});

const updateAllPayments = catchAsync(async (req, res) => {
  const payments = await paymentService.updateAllPayments();
  res.send(payments);
});

module.exports = {
  createPayment,
  getPayment,
  handlePaymentCallback,
  getPaymentStatus,
  updateAllPayments,
};
