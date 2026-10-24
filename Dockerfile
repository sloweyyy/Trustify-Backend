FROM node:20-alpine

WORKDIR /usr/src/node-app
RUN chown node:node /usr/src/node-app
USER node

COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

COPY --chown=node:node . .

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "src/index.js"]
