FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/heat-pump-simulator/package*.json ./services/heat-pump-simulator/
WORKDIR /app/services/heat-pump-simulator
RUN npm install --omit=dev

WORKDIR /app
COPY services/common ./services/common
COPY services/heat-pump-simulator/src ./services/heat-pump-simulator/src

WORKDIR /app/services/heat-pump-simulator

EXPOSE 3011

CMD ["node", "src/index.js"]
