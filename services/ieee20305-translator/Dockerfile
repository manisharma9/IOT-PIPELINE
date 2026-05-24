FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/ieee20305-translator/package*.json ./services/ieee20305-translator/
WORKDIR /app/services/ieee20305-translator
RUN npm install --omit=dev

WORKDIR /app
COPY schemas ./schemas
COPY services/ieee20305-translator/src ./services/ieee20305-translator/src

WORKDIR /app/services/ieee20305-translator

EXPOSE 3002

CMD ["node", "src/index.js"]
