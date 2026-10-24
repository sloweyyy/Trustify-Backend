const mongoose = require('mongoose');
const UserWallet = require('../../../src/models/userWallet.model');

describe('UserWallet Model', () => {
  it('should have a schema', () => {
    expect(UserWallet.schema).toBeDefined();
  });

  it('should have a user field', () => {
    const user = UserWallet.schema.obj.user;
    expect(user).toBeDefined();
    expect(user.type).toBe(mongoose.Schema.Types.ObjectId);
    expect(user.ref).toBe('User');
    expect(user.required).toBe(true);
  });

  it('should have an nftItems field', () => {
    const nftItems = UserWallet.schema.obj.nftItems;
    expect(nftItems).toBeDefined();
    expect(Array.isArray(nftItems)).toBe(true);
    const item = nftItems[0];
    expect(item.mintAddress.type).toBe(String);
    expect(item.mintAddress.required).toBe(true);
    expect(item.mintAddress.trim).toBe(true);
    expect(item.filename.type).toBe(String);
    expect(item.filename.required).toBe(true);
    expect(item.metadataUri.type).toBe(String);
    expect(item.metadataUri.required).toBe(true);
    expect(item.amount.type).toBe(Number);
    expect(item.amount.required).toBe(true);
    expect(item.amount.default).toBe(1);
    expect(item.transactionSignature.type).toBe(String);
    expect(item.mintedAt.type).toBe(Date);
    expect(item.mintedAt.default).toBeDefined();
  });

  it('should have a createdAt field', () => {
    const createdAt = UserWallet.schema.obj.createdAt;
    expect(createdAt).toBeDefined();
    expect(createdAt.type).toBe(Date);
    expect(createdAt.default).toBeDefined();
  });

  it('should have timestamps', () => {
    const timestamps = UserWallet.schema.options.timestamps;
    expect(timestamps).toBe(true);
  });

  it('should have toJSON and paginate plugins', () => {
    const plugins = UserWallet.schema.plugins.map((plugin) => plugin.fn.name);
    expect(plugins).toContain('toJSON');
    expect(plugins).toContain('paginate');
  });
});
