import { test, expect, type Page } from '@playwright/test';

async function gotoTravels(page: Page) {
  await page.goto('/travels');
  await expect(page).toHaveURL(/\/travels$/);
}

test.describe('Website smoke tests', () => {
  test('homepage loads with the current title', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Jakub Drobník/i);
    await expect(page.getByRole('heading', { level: 1, name: /Jakub Drobník/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /travels|cesty/i }).first()).toBeVisible();
  });

  test('travels page renders map and destination data', async ({ page }) => {
    await gotoTravels(page);

    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.travel-map .photo-marker, .travel-map .photo-cluster').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('.destination-card').first()).toBeVisible();
  });

  test('year filters update the destination list', async ({ page }) => {
    await gotoTravels(page);

    const allCards = page.locator('.destination-card');
    await expect(allCards.first()).toBeVisible();
    const before = await allCards.count();

    const yearChip = page.locator('.year-chip').filter({ hasText: /^20\d{2}$/ }).first();
    await expect(yearChip).toBeVisible();
    await yearChip.click();

    await expect(yearChip).toHaveClass(/active/);
    await expect(page.locator('.destination-card').first()).toBeVisible();

    const after = await page.locator('.destination-card').count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
  });

  test('destination modal opens from the destination grid', async ({ page }) => {
    await gotoTravels(page);

    const firstCard = page.locator('.destination-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    await expect(page.locator('.travel-modal')).toBeVisible();
    await expect(page.locator('.carousel-img-main')).toBeVisible();
  });

  test('travels page works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoTravels(page);

    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.destination-card').first()).toBeVisible();
  });

  test('travels page requests destinations API', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/destinations')) {
        apiCalls.push(request.url());
      }
    });

    await gotoTravels(page);
    await expect(page.locator('.destination-card').first()).toBeVisible();

    expect(apiCalls.length).toBeGreaterThan(0);
  });

  test('travels page handles API errors gracefully', async ({ page }) => {
    await page.route('**/api/destinations**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await gotoTravels(page);

    await expect(page.locator('.travel-error')).toBeVisible();
    await expect(page.getByText(/failed to load destinations/i)).toBeVisible();
  });
});
