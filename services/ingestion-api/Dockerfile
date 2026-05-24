FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/ingestion-api/package*.json ./services/ingestion-api/
WORKDIR /app/services/ingestion-api
RUN npm install --omit=dev

WORKDIR /app
COPY schemas ./schemas
COPY services/common ./services/common
COPY services/ingestion-api/src ./services/ingestion-api/src

WORKDIR /app/services/ingestion-api

EXPOSE 3001

CMD ["node", "src/index.js"]
