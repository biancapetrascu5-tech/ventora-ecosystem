if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST;
  process.env.DATABASE_URL_FOUNDER ??= process.env.DATABASE_URL_TEST;
}
process.env.BETTER_AUTH_SECRET ??= 'test-hub-secret-must-be-32-chars-x';
process.env.FOUNDER_AUTH_SECRET ??= 'test-founder-secret-32-chars-abc1';
