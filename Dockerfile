FROM node:20-slim

# Install Playwright system dependencies
RUN npx playwright install-deps chromium

# Install Playwright browsers
RUN npx playwright install chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
