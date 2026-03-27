FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN mkdir -p backend/public && cd frontend && npm run build

FROM oven/bun:alpine AS runner

WORKDIR /app

COPY backend/package.json ./
RUN bun install --production

COPY backend/ ./
COPY --from=frontend-builder /app/backend/public ./public

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
