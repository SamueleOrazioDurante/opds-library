# ── Stage 1: Build the React frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
# vite.config.ts sets outDir: "../backend/public" (relative to frontend dir)
# so the build outputs to /app/backend/public
RUN mkdir -p backend/public && cd frontend && npm run build

# ── Stage 2: Run the Bun backend ────────────────────────────────────────────
FROM oven/bun:alpine AS runner

WORKDIR /app

# Install backend dependencies
COPY backend/package.json ./
RUN bun install --production

# Copy backend source
COPY backend/ ./

# Copy built frontend assets (served by @elysiajs/static from ./public)
COPY --from=frontend-builder /app/backend/public ./public

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
