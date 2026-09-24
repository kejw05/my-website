# My Website

Personal travel photography website with dynamic photo management powered by Cloudflare Workers, D1 database, and R2 storage.

## Architecture

- **Frontend:** React + TypeScript + Vite
- **Backend:** Cloudflare Pages Functions (TypeScript)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (object storage for photos)
- **Deployment:** Cloudflare Pages (unified frontend + API)

## Documentation

- 📘 **[Testing Guide](./docs/TESTING.md)** — How to run and write tests
- 🚀 **[Deployment Guide](./docs/DEPLOYMENT.md)** — Deployment procedures and CI/CD
- 🔄 **[Rollback Plan](./docs/ROLLBACK_PLAN.md)** — Emergency rollback procedures
- 🔐 **[Admin API](./ADMIN_API.md)** — Admin endpoints documentation

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account (for production deployment)

### Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Initialize local D1 database:**

   ```bash
   npm run db:migrate:local
   ```

   This creates the local SQLite database with the `destinations` and `photos` tables.

3. **Seed the database with test data:**

   ```bash
   npm run db:seed:local
   ```

   **⚠️  WARNING: DESTRUCTIVE OPERATION**  
   This script executes `DELETE FROM photos; DELETE FROM destinations;` before inserting seed data.  
   **All existing data in the database will be permanently deleted.**  
   Only run this on a fresh database or when you intentionally want to reset all data.

   The script populates the database with data from `src/data/travels.ts`.

4. **Run the development servers:**

   ```bash
   npm run dev
   ```

   This starts **both**:
   - Frontend (Vite) on `http://localhost:5173`
   - Backend (Cloudflare Pages Functions) on `http://localhost:8788`

   The frontend automatically proxies `/api/*` requests to the Functions dev server.

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend + backend (parallel) |
| `npm run dev:frontend` | Start only Vite dev server |
| `npm run dev:functions` | Start only Pages Functions dev server |
| `npm run build` | Build frontend for production |
| `npm run deploy` | Build and deploy to Cloudflare Pages |
| `npm run db:migrate:local` | Run D1 migrations locally |
| `npm run db:migrate:prod` | Run D1 migrations in production |
| `npm run db:seed:local` | Seed local database with test data |
| `npm run migrate:local` | Migrate photos to R2 and data to D1 (local) |
| `npm run migrate:local:dry` | Dry-run local migration |
| `npm run migrate:prod` | Migrate photos to R2 and data to D1 (production) |
| `npm run migrate:prod:dry` | Dry-run production migration |
| `npm run lint` | Run ESLint |
| `npm test` | Run all tests (API + E2E) |
| `npm run test:api` | Run API integration tests via `scripts/test-server.sh` |
| `npm run test:api:watch` | Run API tests in watch mode |
| `npm run test:coverage` | Run API tests with coverage reporting |
| `npm run test:e2e` | Run E2E smoke tests |
| `npm run test:e2e:ui` | Run E2E tests with UI |

**For migration details, see [docs/MIGRATION_GUIDE.md](./docs/MIGRATION_GUIDE.md)**

## Testing

This project includes comprehensive testing:

- **API Integration Tests** — Vitest against local Wrangler Pages dev
- **E2E Smoke Tests** — Playwright for critical user flows

```bash
# Run all tests
npm test

# Run API tests only
npm run test:api

# Run API coverage
npm run test:coverage

# Run E2E tests only
npm run test:e2e

# Interactive test UI
npm run test:api:ui
npm run test:e2e:ui
```

See [docs/TESTING.md](./docs/TESTING.md) for detailed testing guide.

## Database Schema

### `destinations` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (e.g., "iceland") |
| `name_en` | TEXT | Destination name (English) |
| `name_cs` | TEXT | Destination name (Czech) |
| `description_en` | TEXT | Description (English) |
| `description_cs` | TEXT | Description (Czech) |
| `lat` | REAL | Latitude |
| `lng` | REAL | Longitude |
| `continent` | TEXT | Continent name |
| `year` | INTEGER | Year visited |
| `created_at` | DATETIME | Created timestamp |
| `updated_at` | DATETIME | Updated timestamp |

### `photos` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key |
| `destination_id` | TEXT | Foreign key to `destinations.id` |
| `full_url` | TEXT | Full-size image URL |
| `thumb_url` | TEXT | Thumbnail image URL |
| `blur_url` | TEXT | Blur placeholder URL (optional) |
| `caption_en` | TEXT | Caption (English, optional) |
| `caption_cs` | TEXT | Caption (Czech, optional) |
| `sort_order` | INTEGER | Display order |
| `is_visible` | INTEGER | Visibility flag (1 = visible, 0 = hidden) |
| `created_at` | DATETIME | Created timestamp |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/destinations` | List all destinations (supports `?year=` and `?continent=` filters) |
| `GET` | `/api/destinations/:id` | Get destination with photos |
| `GET` | `/api/photos/:destinationId` | Get photos for a specific destination |

All endpoints support CORS and include proper error handling.

### Example Response: GET `/api/destinations`

```json
{
  "data": [
    {
      "id": "colombia",
      "name_en": "Colombia",
      "name_cs": "Kolumbie",
      "description_en": "Caribbean coastline, colonial Cartagena...",
      "lat": 8.73,
      "lng": -74.55,
      "continent": "South America",
      "year": 2024
    }
  ]
}
```

### Example Response: GET `/api/destinations/colombia`

```json
{
  "data": {
    "id": "colombia",
    "name_en": "Colombia",
    "photos": [
      {
        "id": "colombia-DJI_0659",
        "full_url": "/travel-map/DJI_0659.webp",
        "thumb_url": "/travel-map/DJI_0659-thumb.webp",
        "blur_url": null,
        "sort_order": 0,
        "is_visible": 1
      }
    ]
  }
}
```

## Production Deployment

### Cloudflare Pages (Frontend + API)

The entire application (frontend + API) is deployed as a single Cloudflare Pages project.

**⚠️  Important:** The production bindings in `wrangler.toml` are commented out by default to prevent failed deployments. Before deploying to production, you must set up the Cloudflare resources:

1. **Create D1 database:**

   ```bash
   wrangler d1 create my-website-db
   ```

   This will output a `database_id`. Save it.

2. **Create R2 bucket:**

   ```bash
   wrangler r2 bucket create my-website-photos
   ```

3. **Update `wrangler.toml`:**

   Uncomment the production bindings and replace `REPLACE_WITH_ACTUAL_DATABASE_ID` with your actual database ID from step 1.

4. **Run migrations:**

   ```bash
   npm run db:migrate:prod
   ```

5. **Configure bindings in Cloudflare dashboard:**

   Go to your Pages project > Settings > Functions and add:
   - **D1 binding:** Variable name `DB`, select `my-website-db`
   - **R2 binding:** Variable name `PHOTOS`, select `my-website-photos`

6. **Upload photos to R2:**

   Upload your photo files to the R2 bucket (full, thumb, and blur versions).

7. **Deploy to Cloudflare Pages:**

   ```bash
   npm run deploy
   ```

   Or connect your GitHub repo to Cloudflare Pages for automatic deployments on push.

**GitHub Auto-Deploy:** If you connect your repo to Cloudflare Pages, it will auto-deploy on push. Make sure you've completed the setup above (especially step 5: bindings configuration) before the first deployment.

## Project Structure

```
.
├── functions/            # Cloudflare Pages Functions (API)
│   ├── api/
│   │   ├── health.ts           # GET /api/health
│   │   └── destinations/
│   │       ├── index.ts        # GET /api/destinations
│   │       └── [id].ts         # GET /api/destinations/:id
│   └── types.d.ts
├── migrations/           # D1 database migrations
│   └── 0001_initial_schema.sql
├── public/               # Static assets
│   └── travel-map/       # Photo files
├── scripts/              # Build & utility scripts
│   └── seed-local-db.ts  # Local DB seeding
├── src/                  # Frontend source code
│   ├── components/       # React components
│   ├── data/             # Static data (travels.ts)
│   └── main.tsx          # React entry point
├── worker/               # ⚠️  DEPRECATED (see MIGRATION.md)
│   └── index.ts          # Old Worker code (no longer used)
├── wrangler.toml         # Cloudflare Pages config
├── vite.config.ts        # Vite config (with API proxy)
└── package.json          # Dependencies & scripts
```

## Migration from Workers to Pages Functions

See [MIGRATION.md](./MIGRATION.md) for details on the architecture change from separate Worker deployment to unified Cloudflare Pages with Functions.

## License

Private project.
