# ── Stage 1: Build client (React SPA with Vite) ──
FROM node:20-slim AS client-builder
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci
COPY client/ .
RUN npm run build

# ── Stage 2: Build server (TypeScript) ──
FROM node:20-slim AS server-builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
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
RUN npm install --omit=dev

# Copy compiled JS from server builder
COPY --from=server-builder /app/dist ./dist

# Copy Drizzle migrations
COPY --from=server-builder /app/drizzle ./drizzle

# Copy built React SPA from client builder
COPY --from=client-builder /app/client/dist ./client/dist

# PORT can be set by Coolify via build-arg or runtime env; default 3002
ARG PORT=3002
ENV PORT=$PORT
EXPOSE ${PORT}

CMD ["node", "dist/index.js"]
