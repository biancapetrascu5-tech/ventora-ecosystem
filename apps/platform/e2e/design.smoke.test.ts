import { test, expect } from '@playwright/test';

test.describe('/design smoke', () => {
  test('opens without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/design');

    // Page must load (not 404, not error boundary)
    await expect(page).not.toHaveTitle(/Error/i);
    const h1 = page.locator('h1, [class*="badge"]').first();
    await expect(h1).toBeVisible();

    // No RSC serialization errors or React errors in console
    const rscErrors = consoleErrors.filter(
      (e) =>
        e.includes('Only plain objects') ||
        e.includes('cannot be passed to Client Components') ||
        e.includes('Unhandled Runtime Error'),
    );
    expect(rscErrors, `Console errors: ${JSON.stringify(rscErrors)}`).toHaveLength(0);
  });

  test('renders Button section', async ({ page }) => {
    await page.goto('/design');
    // Sections use <section> element, look for button content
    const primaryBtn = page.getByRole('button', { name: 'Primar' });
    await expect(primaryBtn).toBeVisible();
  });

  test('renders IconButton section without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/design');

    // IconButton renders as a button with aria-label
    const searchBtn = page.getByRole('button', { name: 'Caută' }).first();
    await expect(searchBtn).toBeVisible();

    expect(errors).toHaveLength(0);
  });
});
