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
  test('opens without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/design/demo');

    await expect(page).not.toHaveTitle(/Error/i);
    const heading = page.getByRole('heading', { name: /HubSignIn|HubLauncher|Demo/i }).first();
    await expect(heading).toBeVisible();

    const rscErrors = consoleErrors.filter(
      (e) =>
        e.includes('Only plain objects') ||
        e.includes('cannot be passed to Client Components') ||
        e.includes('Unhandled Runtime Error'),
    );
    expect(rscErrors, `Console errors: ${JSON.stringify(rscErrors)}`).toHaveLength(0);
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
    const greeting = page.getByRole('heading', { name: /Bună dimineața, Bianca/i });
    await expect(greeting).toBeVisible();
  });

  test('renders HubLauncher — AppIcon CRM tile', async ({ page }) => {
    await page.goto('/design/demo');
    const crmTile = page.getByRole('button', { name: 'CRM' });
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
    const demoPage = page.locator('[data-theme="dark"]');
    await expect(demoPage).toBeVisible();
  });
});
