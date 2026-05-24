FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/aggregator/package*.json ./services/aggregator/
WORKDIR /app/services/aggregator
RUN npm install --omit=dev

WORKDIR /app
COPY services/aggregator/src ./services/aggregator/src

WORKDIR /app/services/aggregator

EXPOSE 3003

CMD ["node", "src/index.js"]
