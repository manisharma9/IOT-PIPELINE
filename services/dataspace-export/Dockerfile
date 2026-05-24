FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/dataspace-export/package*.json ./services/dataspace-export/
WORKDIR /app/services/dataspace-export
RUN npm install --omit=dev

WORKDIR /app
COPY services/dataspace-export/src ./services/dataspace-export/src

WORKDIR /app/services/dataspace-export

EXPOSE 3006

CMD ["node", "src/index.js"]
