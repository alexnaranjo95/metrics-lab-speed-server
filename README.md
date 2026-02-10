# metrics-lab-speed-server

Build engine that converts WordPress websites into optimized static sites and deploys them to Cloudflare's edge network.

## Architecture

This server is one piece of a three-part system:

1. **WordPress Plugin** — sits on the customer's WordPress site, detects content changes, sends webhooks
2. **Dashboard at app.metricslab.io** — the UI where users manage sites and trigger builds
3. **This Server** — the build engine that does the actual crawling, optimization, and deployment

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL with Drizzle ORM
- **Job Queue**: BullMQ + Redis
- **Crawler**: Playwright (Chromium)
- **Image Optimization**: Sharp
- **HTML Processing**: Cheerio
- **CSS Processing**: PurgeCSS + CleanCSS
- **JS Processing**: Terser
- **Deployment**: Cloudflare Pages

## Quick Start

### Using Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env with your Cloudflare credentials

docker compose up -d
```

The server will be available at `http://localhost:3001`.

### Manual Setup

```bash
# Prerequisites: Node.js 20+, PostgreSQL, Redis

npm install
npx playwright install chromium

# Set up environment
cp .env.example .env
# Edit .env

# Generate and run migrations
npm run db:generate
npm run db:migrate

# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### Authentication

All API endpoints (except webhooks) require a master API key:

```
Authorization: Bearer YOUR_MASTER_API_KEY
```

### Sites

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sites` | Create a new site |
| GET | `/api/sites/:siteId` | Get site details |
| GET | `/api/sites/:siteId/status` | Get site status |
| DELETE | `/api/sites/:siteId` | Delete a site |

### Builds

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sites/:siteId/builds` | Trigger a build |
| GET | `/api/sites/:siteId/builds/:buildId` | Get build details |
| GET | `/api/sites/:siteId/builds` | List builds (paginated) |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/wordpress` | Inbound webhook from WordPress plugin |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |

## Build Pipeline

When a build is triggered, the pipeline runs these steps:

1. **Crawl** — Playwright crawls the WordPress site, capturing rendered HTML and assets
2. **Optimize HTML** — Remove WordPress bloat, plugin scripts, analytics, meta tags
3. **Optimize CSS** — PurgeCSS removes unused selectors, CleanCSS minifies
4. **Optimize JS** — Terser minifies, dead scripts removed
5. **Optimize Images** — Sharp compresses, generates WebP/AVIF variants
6. **Video Facades** — Replace YouTube/Vimeo/Wistia iframes with lightweight placeholders
7. **Widget Facades** — Replace chat widgets and social embeds with click-to-load facades
8. **Deploy** — Upload optimized files to Cloudflare Pages
9. **Measure** — Run Lighthouse-style performance measurement

## Environment Variables

See `.env.example` for all available configuration options.

## License

ISC
