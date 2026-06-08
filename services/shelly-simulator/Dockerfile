FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/shelly-simulator/package*.json ./services/shelly-simulator/
WORKDIR /app/services/shelly-simulator
RUN npm install --omit=dev

WORKDIR /app
COPY services/common ./services/common
COPY services/shelly-simulator/src ./services/shelly-simulator/src

WORKDIR /app/services/shelly-simulator

EXPOSE 3007

CMD ["node", "src/index.js"]
