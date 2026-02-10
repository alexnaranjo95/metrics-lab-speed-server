# ── Stage 1: Build ──
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ──
FROM node:20-slim

# Install Playwright system dependencies
RUN npx playwright install-deps chromium

# Install Playwright browsers
RUN npx playwright install chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Copy Drizzle migrations
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3001

CMD ["node", "dist/index.js"]
