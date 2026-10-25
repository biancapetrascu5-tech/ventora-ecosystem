import { test, expect } from '@playwright/test';

test.describe('/design smoke', () => {
  // NOTE: page.goto() in Playwright does not fail on HTTP 5xx — it follows the response and
  // renders whatever the server returns. Without an explicit status check the test can pass even
  // when Next.js returns 500 and renders an error overlay (which still has an <h1> element).
  test('returns HTTP 200 and loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const response = await page.goto('/design');

    // Must return HTTP 200 — catches Next.js 500 errors that otherwise pass the DOM checks
    expect(response?.status(), `HTTP status for /design`).toBe(200);

    // Page must load (not 404, not error boundary)
    await expect(page).not.toHaveTitle(/Error/i);
    const h1 = page.locator('h1, [class*="badge"]').first();
    await expect(h1).toBeVisible();

    // No console errors at all (RSC serialisation, React, or runtime)
    expect(consoleErrors, `Console errors: ${JSON.stringify(consoleErrors)}`).toHaveLength(0);
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

  test('renders Lot 3 — Tabs section', async ({ page }) => {
    await page.goto('/design');
    const tabDetalii = page.getByRole('tab', { name: 'Detalii' });
    await expect(tabDetalii).toBeVisible();
  });

  test('renders Lot 3 — Pagination section', async ({ page }) => {
    await page.goto('/design');
    const page1Btn = page.getByRole('button', { name: 'Pagina 1' }).first();
    await expect(page1Btn).toBeVisible();
  });
});

test.describe('/design/demo smoke', () => {
  test('returns HTTP 200 and loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const response = await page.goto('/design/demo');

    // Must return HTTP 200
    expect(response?.status(), `HTTP status for /design/demo`).toBe(200);

    await expect(page).not.toHaveTitle(/Error/i);
    const heading = page.getByRole('heading', { name: /HubSignIn|HubLauncher|Demo/i }).first();
    await expect(heading).toBeVisible();

    // No console errors at all
    expect(consoleErrors, `Console errors: ${JSON.stringify(consoleErrors)}`).toHaveLength(0);
  });

  test('renders HubSignIn — titlu aprobat "Bine ai revenit"', async ({ page }) => {
    await page.goto('/design/demo');
    const title = page.getByRole('heading', { name: 'Bine ai revenit' });
    await expect(title).toBeVisible();
  });

  test('renders HubSignIn — buton "Intră în cont"', async ({ page }) => {
    await page.goto('/design/demo');
    const signInBtn = page.getByRole('button', { name: 'Intră în cont' });
    await expect(signInBtn).toBeVisible();
  });

  test('renders HubSignIn — Checkbox ține-mă minte', async ({ page }) => {
    await page.goto('/design/demo');
    const checkbox = page.getByRole('checkbox', {
      name: /Ține-mă minte pe acest dispozitiv/i,
    });
    await expect(checkbox).toBeVisible();
  });

  test('renders HubLauncher — salut Bianca', async ({ page }) => {
    await page.goto('/design/demo');
    const greeting = page.getByRole('heading', { name: /Bună dimineața, Bianca/i }).first();
    await expect(greeting).toBeVisible();
  });

  test('renders HubLauncher — AppIcon CRM tile', async ({ page }) => {
    await page.goto('/design/demo');
    const crmTile = page.getByRole('button', { name: 'CRM' }).first();
    await expect(crmTile).toBeVisible();
  });

  test('renders HubLauncher — secțiunea "Alte aplicații Ventora"', async ({ page }) => {
    await page.goto('/design/demo');
    const otherSection = page.getByRole('heading', { name: 'Alte aplicații Ventora' });
    await expect(otherSection).toBeVisible();
  });

  test('theme toggle switches between light and dark', async ({ page }) => {
    await page.goto('/design/demo');
    const darkBtn = page.getByRole('button', { name: /dark/i });
    await darkBtn.click();
    const demoPage = page.locator('[data-testid="demo-page"][data-theme="dark"]');
    await expect(demoPage).toBeVisible();
  });
});
