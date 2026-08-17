FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app
COPY services/household-fleet-simulator/package*.json ./services/household-fleet-simulator/
WORKDIR /app/services/household-fleet-simulator
RUN npm install --omit=dev

WORKDIR /app
COPY services/common ./services/common
COPY services/household-fleet-simulator/src ./services/household-fleet-simulator/src

WORKDIR /app/services/household-fleet-simulator
EXPOSE 3012
CMD ["node", "src/index.js"]

