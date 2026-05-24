FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/mock-dispatch-adapter/package*.json ./services/mock-dispatch-adapter/
WORKDIR /app/services/mock-dispatch-adapter
RUN npm install --omit=dev

WORKDIR /app
COPY services/mock-dispatch-adapter/src ./services/mock-dispatch-adapter/src

WORKDIR /app/services/mock-dispatch-adapter

EXPOSE 3005

CMD ["node", "src/index.js"]
