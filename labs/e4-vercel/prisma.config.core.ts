import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/core.prisma',
  datasource: { url: process.env.DATABASE_URL_CORE ?? '' },
});
