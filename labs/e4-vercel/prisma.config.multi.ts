import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/multi.prisma',
  datasource: { url: process.env.DATABASE_URL_MULTI ?? '' },
});
