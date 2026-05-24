FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY services/approval-workflow/package*.json ./services/approval-workflow/
WORKDIR /app/services/approval-workflow
RUN npm install --omit=dev

WORKDIR /app
COPY services/approval-workflow/src ./services/approval-workflow/src

WORKDIR /app/services/approval-workflow

EXPOSE 3004

CMD ["node", "src/index.js"]
