FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY shared ./shared
COPY whatsapp-mock ./whatsapp-mock

RUN npm ci
RUN npm run build:shared
RUN npm run build --workspace=whatsapp-mock

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/whatsapp-mock ./whatsapp-mock

WORKDIR /app/whatsapp-mock

EXPOSE 4001

CMD ["node", "dist/index.js"]
