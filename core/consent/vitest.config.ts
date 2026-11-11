import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'src/__tests__/**/*.integration.test.ts'],
    env: {
      // Decision 11.11.2026: HMAC with CONSENT_HASH_KEY. The CI test secret when set, else a random
      // key per run (like BOOKING_MEDICAL_KEY); no key value lives in the code
      CONSENT_HASH_KEY: process.env.CONSENT_HASH_KEY_TEST || randomBytes(32).toString('base64'),
    },
  },
});
