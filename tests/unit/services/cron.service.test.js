const cron = require('node-cron');
const { autoVerifyDocument } = require('../../../src/services/notarization.service');
const { autoVerifySession } = require('../../../src/services/session.service');
const { updateAllPayments } = require('../../../src/services/payment.service');
const cronService = require('../../../src/services/cron.service');

jest.mock('node-cron');
jest.mock('../../../src/services/notarization.service', () => ({ autoVerifyDocument: jest.fn() }));
jest.mock('../../../src/services/session.service', () => ({ autoVerifySession: jest.fn() }));
jest.mock('../../../src/services/payment.service', () => ({ updateAllPayments: jest.fn() }));

describe('Cron Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startCronJob', () => {
    it('should schedule cron jobs', () => {
      cronService.startCronJob();

      expect(cron.schedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
      expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', autoVerifyDocument);
      expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', autoVerifySession);
      expect(cron.schedule).toHaveBeenCalledWith('0 0 * * *', updateAllPayments);
    });
  });
});
