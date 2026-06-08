FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/enode-simulator/package*.json ./services/enode-simulator/
WORKDIR /app/services/enode-simulator
RUN npm install --omit=dev

WORKDIR /app
COPY services/common ./services/common
COPY services/enode-simulator/src ./services/enode-simulator/src

WORKDIR /app/services/enode-simulator

EXPOSE 3008

CMD ["node", "src/index.js"]
