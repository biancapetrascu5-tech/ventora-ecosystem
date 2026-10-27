// Rulat față de next start (build de producție), nu față de next dev.
// În CI: job smoke-test-prod-guard cu CI_PROD_GUARD=1.
// Local: next build && next start -p 3101, apoi CI_PROD_GUARD=1 pnpm test:e2e --project=prod-guard
import { test, expect } from '@playwright/test';

const DEV_ONLY_ROUTES = [
  '/design',
  '/design/demo',
  '/design/preview/HubSignIn',
  '/design/preview-assets/bundle.js',
  '/design/preview-assets/tokens.css',
  '/design/preview-runtime/react.production.min.js',
  '/design/demo/screen/signin',
  '/design/demo/screen/invite',
  '/design/demo/screen/launcher',
  // Lot 4 gallery
  '/design/demo/gallery/Badge',
  '/design/demo/gallery/Toast',
  '/design/demo/gallery/StatusPill',
  '/design/demo/gallery/StatusDot',
  '/design/demo/gallery/Avatar',
  '/design/demo/gallery/Notice',
  '/design/demo/gallery/EmptyState',
  '/design/demo/gallery/Skeleton',
  '/design/demo/gallery/ProgressBar',
  '/design/demo/gallery/UsageMeter',
  '/design/demo/gallery/AttentionList',
  '/design/demo/gallery/Kbd',
  // Lot 5 gallery
  '/design/demo/gallery/DataTable',
  '/design/demo/gallery/Stat',
  '/design/demo/gallery/BarChart',
  '/design/demo/gallery/LineChart',
  '/design/demo/gallery/Timeline',
  // Lot 6 gallery
  '/design/demo/gallery/DatePicker',
  '/design/demo/gallery/SlotPicker',
  '/design/demo/gallery/RuleBuilder',
  '/design/demo/gallery/Kanban',
  '/design/demo/gallery/Schedule',
  // Agenda
  '/design/demo/gallery/Agenda',
];

test.describe('production guard — rute /design inaccesibile în producție', () => {
  for (const route of DEV_ONLY_ROUTES) {
    test(`${route} → 404 în producție`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), `HTTP status pentru ${route}`).toBe(404);
    });
  }
});
