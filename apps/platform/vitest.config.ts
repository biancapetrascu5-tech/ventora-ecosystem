import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Lotul 5.1: testele unitare ale platformei (logica pură din src/server); e2e/ rămâne la Playwright.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
