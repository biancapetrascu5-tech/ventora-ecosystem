// Rulat față de next start (build de producție), nu față de next dev.
// În CI: job smoke-test-prod-guard cu CI_PROD_GUARD=1.
// Local: next build && next start -p 3101, apoi CI_PROD_GUARD=1 pnpm test:e2e --project=prod-guard
import { test, expect } from '@playwright/test';

const DEV_ONLY_ROUTES = [
  '/design',
  '/design/demo',
  '/design/preview/HubSignIn',
  '/design/preview-assets/bundle.js',
  '/design/preview-runtime/react.production.min.js',
];

test.describe('production guard — rute /design inaccesibile în producție', () => {
  for (const route of DEV_ONLY_ROUTES) {
    test(`${route} → 404 în producție`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), `HTTP status pentru ${route}`).toBe(404);
    });
  }
});
