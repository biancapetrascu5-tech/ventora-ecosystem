import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/catalog.prisma',
  datasource: { url: process.env.DATABASE_URL_CATALOG ?? '' },
});
