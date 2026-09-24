# Tests

## Structure

```
tests/
├── api/                      # API integration tests
│   └── integration.test.ts   # Tests for all API endpoints
└── e2e/                      # End-to-end browser tests
    └── smoke.spec.ts         # Frontend smoke tests
```

## Running Tests

### API Tests

API tests run against a local Wrangler Pages dev server via `scripts/test-server.sh`:

```bash
npm run test:api
```

This will:
1. Build the frontend
2. Apply local D1 migrations
3. Seed local test data
4. Start Wrangler Pages dev server with a persisted local state directory
5. Inject `ADMIN_API_KEY` into the local runtime using `TEST_ADMIN_API_KEY`
6. Run integration tests
7. Stop the server

If you need a non-default key or port, override them when starting the test runner:

```bash
TEST_ADMIN_API_KEY=my-test-key TEST_API_PORT=8789 npm run test:api
```

**Manual testing:**

If you want to run tests against an already-running server:

```bash
# Terminal 1: Start server
ADMIN_API_KEY=test-key-123 npm run dev:functions

# Terminal 2: Run tests
TEST_API_URL=http://localhost:8788 TEST_ADMIN_API_KEY=test-key-123 npm run test:api:only
```

### Coverage

```bash
npm run test:coverage
```

### E2E Tests

```bash
npm run test:e2e
```

E2E tests will automatically start the full local Pages app via `scripts/e2e-server.sh` if it's not already running.

### All Tests

```bash
npm test
```

## Test Environment

### API Tests

- **Server:** Wrangler Pages dev server (local)
- **Database:** Local D1 (SQLite)
- **Storage:** Local R2 (filesystem)
- **Auth:** `TEST_ADMIN_API_KEY` for the test suite, forwarded as `ADMIN_API_KEY` to the local runtime

### E2E Tests

- **Browser:** Chromium (Playwright)
- **Server:** Full dev stack (Vite + Wrangler)
- **Viewport:** Desktop, Tablet, Mobile

## Writing Tests

### API Test Example

```typescript
import { describe, it, expect } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:8788';

describe('My Endpoint', () => {
  it('returns expected data', async () => {
    const response = await fetch(`${API_BASE}/api/my-endpoint`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('result');
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test('my feature works', async ({ page }) => {
  await page.goto('/');
  await page.click('.my-button');
  await expect(page.locator('.result')).toBeVisible();
});
```

## CI/CD

Tests run automatically in GitHub Actions:

- **On PR:** All tests must pass
- **On main push:** Full test suite before deployment

See `.github/workflows/test.yml` and `.github/workflows/deploy.yml`.
