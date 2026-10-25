import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/auth.prisma',
  datasource: { url: process.env.DATABASE_URL_MULTI ?? '' },
});
