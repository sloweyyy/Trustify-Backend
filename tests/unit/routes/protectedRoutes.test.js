const express = require('express');
const request = require('supertest');

// Real auth middleware; passport resolves the user from test headers instead of a JWT.
jest.mock('passport', () => ({
  authenticate: (strategy, options, callback) => (req) => {
    const role = req.headers['x-test-role'];
    if (!role) return callback(null, false, { message: 'No auth token' });
    return callback(null, { id: req.headers['x-test-id'], role });
  },
}));
jest.mock('../../../src/services/payment.service', () => ({
  getPaymentById: jest.fn(),
  getPaymentStatus: jest.fn(),
  createPayment: jest.fn(),
}));
jest.mock('../../../src/controllers/email.controller', () => {
  const sent = (req, res) => res.send({ message: 'sent' });
  return {
    sendResetPassword: sent,
    sendVerification: sent,
    sendInvitation: sent,
    sendDocumentStatusUpdate: sent,
    sendPayment: sent,
    sendDocumentUpload: sent,
  };
});

const paymentService = require('../../../src/services/payment.service');
const emailRoute = require('../../../src/routes/v1/email.route');
const paymentRoute = require('../../../src/routes/v1/payment.route');
const { errorConverter, errorHandler } = require('../../../src/middlewares/error');

const app = express();
app.use(express.json());
app.use('/v1/email', emailRoute);
app.use('/v1/payments', paymentRoute);
app.use(errorConverter);
app.use(errorHandler);

const as = (req, role, id = 'u1') => (role ? req.set('x-test-role', role).set('x-test-id', id) : req);
const payment = { id: 'p1', orderCode: 42, userId: 'owner' };

beforeEach(() => {
  jest.clearAllMocks();
  paymentService.getPaymentById.mockResolvedValue(payment);
  paymentService.getPaymentStatus.mockResolvedValue({ status: 'PAID' });
  paymentService.createPayment.mockResolvedValue(payment);
});

describe('email routes are admin only', () => {
  test.each([
    [undefined, 401],
    ['user', 403],
    ['notary', 403],
    ['admin', 200],
  ])('role %s -> %i', async (role, status) => {
    await as(request(app).post('/v1/email/send-reset-password').send({ to: 'a@b.c', token: 't' }), role).expect(status);
  });
});

describe('create-payment is admin only', () => {
  test.each([
    [undefined, 401],
    ['user', 403],
    ['admin', 201],
  ])('role %s -> %i', async (role, status) => {
    await as(request(app).post('/v1/payments/create-payment').send({ amount: 1 }), role).expect(status);
  });
});

describe.each(['get-payment', 'get-payment-status'])('%s is limited to the payer or an admin', (route) => {
  const url = `/v1/payments/${route}/p1`;

  test('anonymous -> 401', async () => {
    await request(app).get(url).expect(401);
    expect(paymentService.getPaymentById).not.toHaveBeenCalled();
  });

  test('payer -> 200', async () => {
    await as(request(app).get(url), 'user', 'owner').expect(200);
  });

  test('another user -> 404, and PayOS is not queried', async () => {
    await as(request(app).get(url), 'user', 'someone-else').expect(404);
    expect(paymentService.getPaymentStatus).not.toHaveBeenCalled();
  });

  test('admin -> 200', async () => {
    await as(request(app).get(url), 'admin', 'admin-id').expect(200);
  });
});
