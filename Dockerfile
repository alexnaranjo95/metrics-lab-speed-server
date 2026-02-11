# ── Stage 1: Build client (React SPA with Vite) ──
FROM node:20-slim AS client-builder

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci
COPY client/ .
RUN npm run build

# ── Stage 2: Build server (TypeScript) ──
FROM node:20-slim AS server-builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 3: Production ──
FROM node:20-slim

# Install Playwright system dependencies
RUN npx playwright install-deps chromium

# Install Playwright browsers
RUN npx playwright install chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled JS from server builder
COPY --from=server-builder /app/dist ./dist

# Copy Drizzle migrations
COPY --from=server-builder /app/drizzle ./drizzle

# Copy built React SPA from client builder
COPY --from=client-builder /app/client/dist ./client/dist

EXPOSE 3002

CMD ["node", "dist/index.js"]
