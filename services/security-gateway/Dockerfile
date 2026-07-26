FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/security-gateway/package*.json ./services/security-gateway/
WORKDIR /app/services/security-gateway
RUN npm install --omit=dev

WORKDIR /app
COPY services/security-gateway/src ./services/security-gateway/src
COPY database/timescale/011_customer_dashboard_read_model.sql ./database/timescale/011_customer_dashboard_read_model.sql
COPY database/timescale/012_simulated_device_registry.sql ./database/timescale/012_simulated_device_registry.sql

WORKDIR /app/services/security-gateway

EXPOSE 3010

CMD ["node", "src/index.js"]
