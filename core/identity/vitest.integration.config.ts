import { defineConfig } from 'vitest/config';

const testDbUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:test@localhost:5432/ventora_identity_test';
const founderDbUrl = process.env.DATABASE_URL_FOUNDER_TEST ?? testDbUrl;

export default defineConfig({
  test: {
    setupFiles: ['./src/__tests__/test-setup.ts', './src/__tests__/runtime-role.setup.ts'],
    include: ['src/__tests__/**/*.integration.test.ts'],
    testTimeout: 30000,
    singleFork: true,
    env: {
      DATABASE_URL: testDbUrl,
      DATABASE_URL_FOUNDER: founderDbUrl,
      DATABASE_URL_APP_RUNTIME: process.env.DATABASE_URL_APP_RUNTIME ?? '',
      DATABASE_URL_ADMIN_TEST: process.env.DATABASE_URL_ADMIN_TEST ?? '',
    },
  },
});
