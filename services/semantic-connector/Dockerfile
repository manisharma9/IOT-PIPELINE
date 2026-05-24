FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/semantic-connector/package*.json ./services/semantic-connector/
WORKDIR /app/services/semantic-connector
RUN npm install --omit=dev

WORKDIR /app
COPY services/semantic-connector/src ./services/semantic-connector/src

WORKDIR /app/services/semantic-connector

CMD ["node", "src/index.js"]
