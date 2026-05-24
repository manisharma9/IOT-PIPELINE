FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/engine/package*.json ./services/engine/
WORKDIR /app/services/engine
RUN npm install --omit=dev

WORKDIR /app
COPY schemas ./schemas
COPY services/common ./services/common
COPY services/engine/src ./services/engine/src

WORKDIR /app/services/engine

CMD ["node", "src/index.js"]
