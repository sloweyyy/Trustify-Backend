const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Session, User } = require('../../../src/models');
const { getAllSessions } = require('../../../src/services/session.service');

setupTestDB();

const makeSession = (createdBy, sessionName) => ({
  sessionName,
  notaryField: { name: 'Sao y chứng thực' },
  notaryService: { name: 'Chứng thực bản sao từ bản chính' },
  startTime: '09:00',
  startDate: new Date('2026-10-25'),
  endTime: '10:00',
  endDate: new Date('2026-10-25'),
  users: [],
  amount: 1,
  createdBy,
});

describe('sessionService.getAllSessions', () => {
  beforeEach(async () => {
    await Promise.all([Session.deleteMany({}), User.deleteMany({})]);
  });

  test('returns an empty page instead of an error when there are no sessions', async () => {
    const result = await getAllSessions({}, { page: '1', limit: '25' });
    expect(result).toEqual({ results: [], page: 1, limit: 25, totalPages: 0, totalResults: 0 });
  });

  test('paginates in the database and attaches each creator', async () => {
    const creator = await User.create({ name: 'Nguyen Van A', email: 'creator@example.com', password: 'password1' });
    await Session.insertMany([1, 2, 3].map((n) => makeSession(creator._id, `Phiên ${n}`)));

    const page2 = await getAllSessions({}, { page: '2', limit: '2' });

    expect(page2.totalResults).toBe(3);
    expect(page2.totalPages).toBe(2);
    expect(page2.page).toBe(2);
    expect(page2.limit).toBe(2);
    expect(page2.results).toHaveLength(1);
    expect(page2.results[0].creator).toEqual(
      expect.objectContaining({ email: 'creator@example.com', name: 'Nguyen Van A' })
    );
  });

  test('falls back to page 1 / limit 10 for missing or invalid options', async () => {
    const result = await getAllSessions({}, { page: 'abc', limit: '-5' });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  test('returns a null creator when the creator account no longer exists', async () => {
    await Session.create(makeSession(mongoose.Types.ObjectId(), 'Phiên mồ côi'));
    const result = await getAllSessions({}, {});
    expect(result.results[0].creator).toBeNull();
  });
});
