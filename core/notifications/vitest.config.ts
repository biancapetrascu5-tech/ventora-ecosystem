import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'src/__tests__/**/*.integration.test.ts'],
  },
});
