FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/mqtt-subscriber/package*.json ./services/mqtt-subscriber/
WORKDIR /app/services/mqtt-subscriber
RUN npm install --omit=dev

WORKDIR /app
COPY schemas ./schemas
COPY services/common ./services/common
COPY services/mqtt-subscriber/src ./services/mqtt-subscriber/src

WORKDIR /app/services/mqtt-subscriber

CMD ["node", "src/index.js"]
