# Deployment Guide

This guide covers deployment procedures for the my-website project on Cloudflare Pages.

## Architecture

- **Frontend:** React SPA deployed to Cloudflare Pages
- **Backend:** Cloudflare Pages Functions (serverless)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (object storage)

## Deployment Environments

### Production

- **URL:** https://my-website.pages.dev
- **Branch:** `main`
- **Auto-deploy:** Enabled (on push to main)

### Preview

- **URL:** Generated per PR (e.g., `abc123.my-website.pages.dev`)
- **Branches:** All feature branches
- **Auto-deploy:** Enabled (on push to PR branch)

## Automated Deployment (Recommended)

Deployments happen automatically via GitHub Actions when you push to `main`:

```bash
git checkout main
git pull origin main
git merge feature/my-feature
git push origin main
```

**Pipeline steps:**

1. ✅ Run API unit tests
2. ✅ Build frontend
3. ✅ Run E2E smoke tests
4. ✅ Apply D1 migrations
5. ✅ Deploy to Cloudflare Pages
6. ✅ Health check

**Duration:** ~3-5 minutes

### Monitoring Deployment

Watch progress in GitHub Actions:

```
https://github.com/kejw05/kejw-page/actions
```

Or get notified via GitHub:
- Settings → Notifications → Actions → Enable

## Manual Deployment

If you need to deploy manually:

### Prerequisites

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Authenticate:
   ```bash
   wrangler login
   ```

3. Set environment variables (if not in `.dev.vars`):
   ```bash
   export CLOUDFLARE_API_TOKEN=your_token
   export CLOUDFLARE_ACCOUNT_ID=your_account_id
   ```

### Deploy Steps

```bash
# 1. Run tests locally
npm run test

# 2. Build frontend
npm run build

# 3. Apply migrations (if needed)
npm run db:migrate:prod

# 4. Deploy to Cloudflare Pages
wrangler pages deploy dist --project-name=my-website

# 5. Verify deployment
curl https://my-website.pages.dev/api/health
```

## Database Migrations

### Applying Migrations

**Automatic (via CI/CD):**

Migrations run automatically during deployment.

**Manual:**

```bash
# Production
npm run db:migrate:prod

# Or with Wrangler directly
wrangler d1 migrations apply my-website-db --remote
```

### Creating New Migrations

```bash
# Create migration file
wrangler d1 migrations create my-website-db add_new_field

# Edit the generated file in migrations/
# migrations/0003_add_new_field.sql
```

Example migration:

```sql
-- Add a new field to destinations
ALTER TABLE destinations ADD COLUMN new_field TEXT;

-- Update existing rows
UPDATE destinations SET new_field = 'default_value';
```

### Migration Best Practices

✅ **Do:**
- Test migrations locally first (`npm run db:migrate:local`)
- Write idempotent migrations (safe to run multiple times)
- Keep migrations small and focused
- Document breaking changes

❌ **Don't:**
- Mix schema changes with data changes
- Delete migrations that have run in production
- Make destructive changes without backups

## Environment Variables

### Setting Environment Variables

**In Cloudflare Dashboard:**

1. Go to Pages → my-website → Settings → Environment variables
2. Add variables for both **Production** and **Preview**

**Required variables:**

- None currently (all config in `wrangler.toml`)

**Optional variables:**

- `ADMIN_API_KEY` — Secret key for admin API access
- `CF_ACCESS_TEAM_DOMAIN` — Cloudflare Access team domain

**Local development:**

Create `.dev.vars` (git-ignored):

```bash
ADMIN_API_KEY=test-key-123
```

## Cloudflare Bindings

Bindings connect your Functions to Cloudflare resources.

### D1 Database

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-website-db"
database_id = "your-database-id"
```

Access in code:

```typescript
export async function onRequest(context) {
  const { DB } = context.env;
  const result = await DB.prepare('SELECT * FROM destinations').all();
}
```

### R2 Bucket

```toml
[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "my-website-photos"
```

Access in code:

```typescript
export async function onRequest(context) {
  const { PHOTOS } = context.env;
  const photo = await PHOTOS.get('path/to/photo.jpg');
}
```

### Verifying Bindings

After deployment, verify bindings work:

```bash
curl https://my-website.pages.dev/api/health
curl https://my-website.pages.dev/api/destinations
```

## Rollback

See [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) for detailed rollback procedures.

**Quick rollback:**

1. Go to Cloudflare Dashboard → Pages → my-website → Deployments
2. Find the last working deployment
3. Click "Rollback to this deployment"

## Deployment Checklist

Before merging to main:

- [ ] All tests pass locally (`npm test`)
- [ ] PR approved by reviewer
- [ ] Database migrations tested locally
- [ ] Breaking changes documented
- [ ] Environment variables added (if needed)

After deployment:

- [ ] Health check passes
- [ ] Smoke test critical flows
- [ ] Monitor error rates for 15 minutes
- [ ] Check Cloudflare Analytics

## Monitoring

### Health Check

```bash
curl https://my-website.pages.dev/api/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2024-03-23T12:00:00Z"
}
```

### Cloudflare Analytics

View in dashboard:

- **Pages Analytics:** Requests, errors, latency
- **Web Analytics:** Visitors, page views, Core Web Vitals
- **Logs:** Real-time function logs (Workers paid plan)

### Error Tracking

**Cloudflare Dashboard:**

1. Go to Pages → my-website → Functions
2. View recent errors and stack traces

**External Tools (optional):**

- Sentry for error tracking
- LogFlare for structured logging
- UptimeRobot for uptime monitoring

## Performance

### Build Optimization

```bash
# Build with production optimizations
npm run build

# Analyze bundle size
npx vite-bundle-visualizer
```

### Cloudflare Optimizations

Enabled by default:

- ✅ HTTP/3 (QUIC)
- ✅ Brotli compression
- ✅ Auto minify (JS, CSS, HTML)
- ✅ Edge caching (static assets)
- ✅ Smart routing

### Cache Control

Static assets are cached at the edge. To bust cache:

1. **Change filename** (Vite does this automatically with hashed filenames)
2. **Purge cache** in Cloudflare dashboard (if needed)

## Troubleshooting

### Deployment fails in CI

Check GitHub Actions logs:

```
https://github.com/kejw05/kejw-page/actions
```

Common issues:

- Tests failing → Fix tests first
- Migration error → Test migration locally
- Build error → Run `npm run build` locally
- Wrangler auth error → Check GitHub secrets

### API returns 500 errors

Check Cloudflare Pages Functions logs:

1. Dashboard → Pages → my-website → Functions
2. View recent errors

Common causes:

- D1 binding missing
- R2 binding missing
- Database schema mismatch
- Unhandled exception in code

### Frontend shows blank page

Check browser console:

- API request failing?
- JavaScript error?
- CORS issue?

Check Cloudflare Pages build logs:

- Build succeeded?
- Assets uploaded?

## CI/CD Configuration

### GitHub Secrets

Required secrets (set in repo settings):

```
CLOUDFLARE_API_TOKEN       # Token with Pages & D1 permissions
CLOUDFLARE_ACCOUNT_ID      # Your Cloudflare account ID
CODECOV_TOKEN              # (Optional) For coverage reports
```

### Workflows

**`.github/workflows/test.yml`**

Runs on every PR:
- API unit tests
- E2E smoke tests
- Lint checks

**`.github/workflows/deploy.yml`**

Runs on push to main:
- All tests
- Migrations
- Deployment
- Health check

## Local Development vs Production

| Feature | Local | Production |
|---------|-------|------------|
| Frontend | http://localhost:5173 | https://my-website.pages.dev |
| API | http://localhost:8788 | https://my-website.pages.dev/api |
| Database | Local SQLite | Cloudflare D1 |
| Storage | Local filesystem | Cloudflare R2 |
| Auth | Test API key | Production API key |

## Support

**Cloudflare Status:** https://www.cloudflarestatus.com/

**Cloudflare Docs:**
- [Pages](https://developers.cloudflare.com/pages/)
- [D1](https://developers.cloudflare.com/d1/)
- [R2](https://developers.cloudflare.com/r2/)

**Repository Issues:** https://github.com/kejw05/kejw-page/issues

---

**Last Updated:** 2024-03-23  
**Owner:** @kejw05
