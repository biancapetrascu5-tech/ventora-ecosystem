import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/runtime-role.setup.ts'],
    testTimeout: 30000,
    // TR.8 renames audit.append_event for a moment: files must not run side by side.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '',
      DIRECT_URL: process.env.DATABASE_URL_ADMIN_TEST ?? process.env.DIRECT_URL ?? '',
      // Lot 2.5c: Founder side (support sessions, owner recovery) on founder_runtime
      DATABASE_URL_FOUNDER:
        process.env.DATABASE_URL_FOUNDER_TEST ?? process.env.DATABASE_URL_FOUNDER ?? '',
    },
  },
});
