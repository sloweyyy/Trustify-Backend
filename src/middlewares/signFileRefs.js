const { STORAGE_PREFIX, isFileRef, signFileRef } = require('../config/storage');

const signDeep = (value) => {
  if (isFileRef(value)) return signFileRef(value);
  if (Array.isArray(value)) return value.map(signDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, signDeep(inner)]));
  }
  return value;
};

/**
 * Private files are stored as `storage://<key>` references. Replace them with
 * short-lived signed links in every JSON response, so a client only gets a working
 * link for files in records it is already allowed to read.
 */
const signFileRefs = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    const serialized = JSON.stringify(body);
    if (serialized === undefined || !serialized.includes(STORAGE_PREFIX)) return json(body);
    return json(signDeep(JSON.parse(serialized)));
  };
  next();
};

module.exports = signFileRefs;
