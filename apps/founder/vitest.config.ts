import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Lotul 5.10: testele unitare ale aplicației Founder (logica pură din src).
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
