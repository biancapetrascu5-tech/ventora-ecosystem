import { defineConfig } from 'vitest/config';

// DATABASE_URL_TEST         → app_runtime (dispecerul: SET LOCAL ROLE + contextul din plic)
// DATABASE_URL_FOUNDER_TEST → founder_runtime (lista dead-letter)
// DATABASE_URL_ADMIN_TEST   → postgres (schema de test, migrarea-șablon, verificări)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.integration.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
