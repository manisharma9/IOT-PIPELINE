FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/device-command-translator/package*.json ./services/device-command-translator/
WORKDIR /app/services/device-command-translator
RUN npm install --omit=dev

WORKDIR /app
COPY services/device-command-translator/src ./services/device-command-translator/src

WORKDIR /app/services/device-command-translator

EXPOSE 3009

CMD ["node", "src/index.js"]
