import { defineConfig, devices } from '@playwright/test';

// prod-guard project necesită: next build (anterior) + next start -p 3101
// Rulat explicit cu CI_PROD_GUARD=1, altfel proiectul e omis
const prodGuardWebServer = process.env.CI_PROD_GUARD
  ? [
      {
        command: 'pnpm exec next start -p 3101',
        url: 'http://localhost:3101',
        reuseExistingServer: false,
        timeout: 60_000,
      },
    ]
  : [];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/*.prod-guard.test.ts',
    },
    {
      name: 'prod-guard',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3101' },
      testMatch: '**/*.prod-guard.test.ts',
    },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    ...prodGuardWebServer,
  ],
});
