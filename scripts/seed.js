/**
 * Seeds the notarization catalog (fields + services) and QA accounts.
 * Idempotent: existing records (matched by name/email) are updated, not duplicated.
 *
 *   yarn seed                     # uses MONGODB_URL from .env
 *   SEED_PASSWORD=xxx yarn seed   # override the QA account password
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, NotarizationField, NotarizationService } = require('../src/models');
const catalog = require('../src/seed/catalog.json');

const password = process.env.SEED_PASSWORD || 'Trustify@123';

const accounts = [
  { name: 'Trustify Admin', email: 'trustify.admin@example.com', role: 'admin' },
  { name: 'Trustify Notary', email: 'trustify.notary@example.com', role: 'notary' },
  { name: 'Nguyen Van A', email: 'trustify.user@example.com', role: 'user' },
  { name: 'Tran Thi B', email: 'trustify.user2@example.com', role: 'user' },
];

const seedCatalog = async () => {
  let services = 0;
  for (const { services: fieldServices, ...field } of catalog) {
    const doc = await NotarizationField.findOneAndUpdate({ name: field.name }, field, { upsert: true, new: true });
    for (const service of fieldServices) {
      await NotarizationService.findOneAndUpdate(
        { name: service.name },
        { ...service, fieldId: doc._id },
        { upsert: true, new: true }
      );
      services += 1;
    }
  }
  return { fields: catalog.length, services };
};

const seedAccounts = async () => {
  for (const account of accounts) {
    const user = (await User.findOne({ email: account.email })) || new User(account);
    Object.assign(user, account, { password, isEmailVerified: true });
    await user.save();
  }
};

const run = async () => {
  if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is not set');
  await mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true });
  const counts = await seedCatalog();
  await seedAccounts();
  console.log(`Seeded ${counts.fields} fields, ${counts.services} services, ${accounts.length} accounts.`);
  console.log(`QA accounts (password: ${password}):`);
  accounts.forEach((a) => console.log(`  ${a.role.padEnd(7)} ${a.email}`));
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
