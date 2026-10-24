/**
 * PayOS client. Without PAYOS_* keys (or with PAYMENT_MODE=mock) a mock client is used:
 * the checkout URL jumps straight to the frontend redirect page as a successful payment,
 * so the full notarize -> pay -> mint NFT flow can be tested without a merchant account.
 */
const PayOS = require('@payos/node');
require('dotenv').config();
const logger = require('./logger');

const hasKeys = Boolean(process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY);
const mockMode = process.env.PAYMENT_MODE === 'mock' || !hasKeys;

const mockPayOS = {
  async createPaymentLink({ orderCode, amount, description, returnUrl }) {
    const params = new URLSearchParams({
      code: '00',
      id: `mock-${orderCode}`,
      cancel: 'false',
      status: 'PAID',
      orderCode: String(orderCode),
    });
    const sep = returnUrl.includes('?') ? '&' : '?';
    return {
      orderCode,
      amount,
      description,
      status: 'PENDING',
      paymentLinkId: `mock-${orderCode}`,
      checkoutUrl: `${returnUrl}${sep}${params.toString()}`,
    };
  },
  async getPaymentLinkInformation(orderCode) {
    return { orderCode, status: 'PAID', id: `mock-${orderCode}` };
  },
  async cancelPaymentLink(orderCode) {
    return { orderCode, status: 'CANCELLED' };
  },
};

const payOS = mockMode
  ? mockPayOS
  : new PayOS(process.env.PAYOS_CLIENT_ID, process.env.PAYOS_API_KEY, process.env.PAYOS_CHECKSUM_KEY);

logger.info(`Payment mode: ${mockMode ? 'mock' : 'payos'}`);

module.exports = { payOS, mockMode };
