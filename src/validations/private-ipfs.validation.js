const Joi = require('joi');

const createAccessLink = {
  body: Joi.object().keys({
    cid: Joi.string().required(),
  }),
};

module.exports = {
  createAccessLink,
};
