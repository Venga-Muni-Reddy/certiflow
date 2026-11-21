FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configurations and workspaces
COPY package*.json ./
COPY tsconfig.base.json ./
COPY shared ./shared
COPY backend ./backend

# Install dependencies and build shared and backend
RUN npm ci
RUN npm run build:shared
RUN cd backend && npx prisma generate
RUN npm run build --workspace=backend

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl postgresql-client

COPY --from=builder /app ./

WORKDIR /app/backend

EXPOSE 4000

CMD ["sh", "-c", "node dist/db/setup.js && npx tsx prisma/seed.ts && node dist/index.js"]
