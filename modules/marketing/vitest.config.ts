import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    // the DB-backed suites run under test:integration
    exclude: ['src/__tests__/**/*.integration.test.ts', 'src/__tests__/**/*.e2e.test.ts'],
  },
});
