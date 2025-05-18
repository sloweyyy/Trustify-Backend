const { version } = require('../../package.json');
const config = require('../config/config');

const swaggerDef = {
  openapi: '3.0.0',
  info: {
    title: 'Notarization Platform API',
    version,
    license: {
      name: 'MIT',
      url: 'https://github.com/sloweyyy/Trustify-Backend',
    },
  },
  servers: [
    {
      url: `${config.host}/v1`,
    },
  ],
};

module.exports = swaggerDef;
