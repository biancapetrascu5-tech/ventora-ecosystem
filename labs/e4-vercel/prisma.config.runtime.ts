import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/runtime.prisma',
  datasource: { url: process.env.DATABASE_URL_RUNTIME ?? '' },
});
