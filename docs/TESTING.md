# Testing Guide

This document describes the testing setup and how to run tests for the my-website project.

## Test Stack

- **API Integration Tests:** Vitest against a local Wrangler Pages dev server
- **E2E Tests:** Playwright against a local Pages app bootstrapped by `scripts/e2e-server.sh`
- **Coverage:** Vitest V8 coverage via `@vitest/coverage-v8`

## Test Structure

```
tests/
├── api/
│   └── integration.test.ts # API integration tests against local wrangler
└── e2e/
    └── smoke.spec.ts       # Frontend smoke tests
```

## Running Tests

### All Tests

```bash
npm test
```

### API Integration Tests

```bash
# Run once
npm run test:api

# Watch mode (re-run on file changes)
npm run test:api:watch

# Interactive UI
npm run test:api:ui

# Coverage report
npm run test:coverage
```

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Interactive UI
npm run test:e2e:ui

# Debug mode (step through tests)
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/smoke.spec.ts

# Run tests in headed mode (see browser)
npx playwright test --headed
```

## API Integration Tests

API tests use Vitest against a local Wrangler Pages dev server started by `scripts/test-server.sh`. The helper builds the app, applies local D1 migrations, starts Pages dev with a persisted state directory, and then runs `vitest` against `TEST_API_URL`.

### Writing API Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

describe('My API Endpoint', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await env.DB.prepare('DELETE FROM destinations').run();
  });

  it('should return data', async () => {
    // Make request to your API
    const response = await SELF.fetch('http://example.com/api/endpoint');
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('data');
  });
});
```

### Test Environment

- **D1 Database:** In-memory SQLite database (isolated per test file)
- **R2 Storage:** In-memory object storage
- **Environment Variables:** Set via `env.VARIABLE_NAME = 'value'`

### Coverage

Coverage reports are generated in `coverage/` directory:

```bash
npm run test:coverage

# Open coverage report
open coverage/index.html
```

## E2E Tests

E2E tests use Playwright to test the full application in a real browser.

### What E2E Tests Cover

- ✅ Homepage loads correctly
- ✅ Map displays with markers
- ✅ Filters work (year, continent)
- ✅ Destination detail opens
- ✅ Photos load from API
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ API integration
- ✅ Error handling

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('my feature works', async ({ page }) => {
  await page.goto('/');
  
  // Wait for element
  await page.waitForSelector('.my-element');
  
  // Interact with page
  await page.click('.my-button');
  
  // Assert
  await expect(page.locator('.result')).toBeVisible();
});
```

### Debugging E2E Tests

**Visual debugging:**

```bash
npm run test:e2e:debug
```

This opens a Playwright Inspector where you can:
- Step through tests
- Inspect page state
- See test execution in real-time

**Screenshots on failure:**

Playwright automatically takes screenshots when tests fail. Find them in `test-results/`.

**Trace viewer:**

```bash
npx playwright show-trace test-results/path-to-trace.zip
```

## CI/CD Integration

Tests run automatically on:

1. **Pull Requests** — All tests must pass before merge
2. **Main branch push** — Full test suite before deployment

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
- API unit tests
- E2E smoke tests
- Lint checks

# .github/workflows/deploy.yml
- Build app
- Deploy to Cloudflare Pages
- Apply D1 migrations
- Post-migration health check
```

### CI Environment Variables

Required secrets in GitHub repository settings:

- `CLOUDFLARE_API_TOKEN` — API token with Pages and D1 permissions
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID
- `CODECOV_TOKEN` — (Optional) For coverage reporting

## Test Data

### Local Development

```bash
# Seed local database with test data
npm run db:seed:local
```

⚠️ **Warning:** This deletes all existing data!

### Test Fixtures

API tests seed their own data in `beforeEach` hooks:

```typescript
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM destinations').run();
  
  await env.DB.prepare(`
    INSERT INTO destinations (id, name_en, ...)
    VALUES (?, ?, ...)
  `).bind('test-id', 'Test Destination', ...).run();
});
```

## Best Practices

### API Tests

✅ **Do:**
- Clean up database in `beforeEach`
- Test both happy paths and error cases
- Test validation logic
- Test authentication/authorization
- Use descriptive test names

❌ **Don't:**
- Make real API calls to external services
- Share state between tests
- Hard-code sensitive data

### E2E Tests

✅ **Do:**
- Test critical user flows
- Use data-testid attributes for stable selectors
- Test responsive design
- Handle async operations properly
- Keep tests fast and focused

❌ **Don't:**
- Test every edge case in E2E (use unit tests)
- Make tests brittle with CSS selectors
- Create flaky tests with hard-coded timeouts
- Test internal implementation details

## Troubleshooting

### "Module not found" in API tests

Make sure you're using the correct import paths:

```typescript
import { env, SELF } from 'cloudflare:test';
```

Not:

```typescript
import { env } from '@cloudflare/workers-types';
```

### E2E tests timing out

Increase timeout in `playwright.config.ts`:

```typescript
use: {
  actionTimeout: 10000,
  navigationTimeout: 30000,
}
```

### Tests pass locally but fail in CI

Common causes:

1. **Different Node.js version** — Match CI version in `.nvmrc`
2. **Missing environment variables** — Check GitHub secrets
3. **Race conditions** — Add proper `waitFor` calls
4. **Timezone differences** — Use UTC in tests

### Flaky E2E tests

If tests fail randomly:

1. Add explicit waits:
   ```typescript
   await page.waitForLoadState('networkidle');
   ```

2. Use Playwright's built-in retry:
   ```typescript
   await expect(element).toBeVisible({ timeout: 5000 });
   ```

3. Check for race conditions in your code

## Performance

### Speed Up Tests

**API tests:**

- Tests run in parallel by default
- Each file gets isolated environment
- Use `test.concurrent` for heavy parallelization

**E2E tests:**

- Configure workers in `playwright.config.ts`:
  ```typescript
  workers: process.env.CI ? 1 : 4
  ```

- Run specific tests during development:
  ```bash
  npx playwright test smoke --grep "loads homepage"
  ```

### Test Execution Times

Typical execution times:

- API tests: ~2-5 seconds
- E2E tests: ~30-60 seconds
- Full suite in CI: ~2-3 minutes

## Coverage Goals

Target coverage metrics:

- **API endpoints:** 80%+ coverage
- **Critical paths:** 100% coverage
- **Error handling:** 100% coverage

View coverage:

```bash
npm run test:api
open coverage/index.html
```

## Adding New Tests

### New API Endpoint

1. Create test file in `tests/api/`
2. Set up database in `beforeEach`
3. Test happy path
4. Test error cases
5. Test validation

### New Frontend Feature

1. Add E2E test in `tests/e2e/`
2. Test user interaction
3. Test responsive behavior
4. Test error states

## Resources

- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Last Updated:** 2024-03-23  
**Owner:** @kejw05
