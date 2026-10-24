/**
 * End-to-end smoke test of the document notarization flow against a running API.
 * Requires seeded QA accounts (yarn seed) and PAYMENT_MODE=mock (default without PayOS keys).
 *
 *   API_URL=http://localhost:3000/v1 node scripts/smoke-e2e.js
 */
const axios = require('axios');

const API = (process.env.API_URL || 'http://localhost:3000/v1').replace(/\/$/, '');
const PASSWORD = process.env.SEED_PASSWORD || 'Trustify@123';

const step = async (name, fn) => {
  process.stdout.write(`- ${name} ... `);
  try {
    const out = await fn();
    console.log('ok');
    return out;
  } catch (err) {
    console.log('FAILED');
    console.error(err.response ? JSON.stringify(err.response.data).slice(0, 500) : err.message);
    process.exit(1);
  }
};

const login = async (email) => {
  const { data } = await axios.post(`${API}/auth/login`, { email, password: PASSWORD });
  return { token: data.tokens.access.token, user: data.user };
};

const authed = (session) => ({ headers: { Authorization: `Bearer ${session.token}`, userId: session.user.id } });

const pdf = (text) =>
  new Blob([`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${text}\ntrailer<</Root 1 0 R>>\n%%EOF\n`], {
    type: 'application/pdf',
  });

const run = async () => {
  console.log(`API: ${API}`);
  const user = await step('login user', () => login('trustify.user@example.com'));
  const notary = await step('login notary', () => login('trustify.notary@example.com'));

  const { field, service } = await step('load catalog', async () => {
    const fields = (await axios.get(`${API}/notarization-fields/get-all-notarization-fields`, authed(user))).data;
    const services = (await axios.get(`${API}/notarization-services/get-all-notarization-services`, authed(user))).data;
    const svc = services.find((s) => s.code === 'Certified_Copy') || services[0];
    const fld = fields.find((f) => f.id === String(svc.fieldId.id || svc.fieldId)) || fields[0];
    return { field: fld, service: svc };
  });

  const doc = await step('user uploads document', async () => {
    const form = new FormData();
    form.append('files', pdf('original'), 'original_doc.pdf');
    form.append(
      'notarizationService',
      JSON.stringify({
        id: service.id,
        name: service.name,
        fieldId: String(service.fieldId.id || service.fieldId),
        description: service.description,
        price: service.price,
        required_documents: service.required_documents,
        code: service.code,
      })
    );
    form.append(
      'notarizationField',
      JSON.stringify({ id: field.id, name: field.name, description: field.description, code: field.code, name_en: field.name_en })
    );
    form.append(
      'requesterInfo',
      JSON.stringify({ fullName: 'Nguyen Van A', citizenId: '079200000001', phoneNumber: '0900000001', email: 'trustify.user@example.com' })
    );
    form.append('amount', '1');
    return (await axios.post(`${API}/notarization/upload-files`, form, authed(user))).data;
  });
  const documentId = doc._id || doc.id;

  await step('notary accepts (pending -> processing)', () =>
    axios.patch(`${API}/notarization/forwardDocumentStatus/${documentId}`, { action: 'accept' }, authed(notary))
  );

  await step('notary uploads notarized output (processing -> digitalSignature)', () => {
    const form = new FormData();
    form.append('action', 'accept');
    form.append('files', pdf('notarized'), 'notarized_doc.pdf');
    return axios.patch(`${API}/notarization/forwardDocumentStatus/${documentId}`, form, authed(notary));
  });

  await step('user signs', () => {
    const form = new FormData();
    form.append('documentId', documentId);
    form.append('signatureImage', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'sig.png');
    return axios.post(`${API}/notarization/approve-signature-by-user`, form, authed(user));
  });

  const approval = await step('notary signs (creates payment)', () => {
    const form = new FormData();
    form.append('documentId', documentId);
    return axios.post(`${API}/notarization/approve-signature-by-notary`, form, authed(notary)).then((r) => r.data);
  });

  const payment = await step('pending payment visible to user', async () => {
    const { data } = await axios.get(`${API}/payments/my-payments?status=pending`, authed(user));
    const found = data.find((p) => p.documentId === documentId);
    if (!found) throw new Error(`no pending payment for ${documentId}: ${JSON.stringify(approval)}`);
    return found;
  });
  const { orderCode } = payment;

  await step('payment callback PAID (mints NFT on Solana)', () =>
    axios.put(`${API}/payments/handle-payment-callback/${orderCode}`, { status: 'PAID' }, { timeout: 120000 })
  );

  const wallet = await step('NFT is in user wallet', async () => {
    const { data } = await axios.get(`${API}/userWallet/wallet`, authed(user));
    const items = data.nftItems || [];
    if (!items.length) throw new Error('wallet is empty');
    return items[items.length - 1];
  });

  console.log(`\nMinted: ${wallet.mintAddress}\nExplorer: ${wallet.explorerLink || wallet.solscanLink || '(n/a)'}`);
};

run();
