import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/crm.prisma',
  datasource: { url: process.env.DATABASE_URL_CRM ?? '' },
});
