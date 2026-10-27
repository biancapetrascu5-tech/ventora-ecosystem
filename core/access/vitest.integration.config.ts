import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? process.env.DIRECT_URL ?? '',
    },
  },
});
