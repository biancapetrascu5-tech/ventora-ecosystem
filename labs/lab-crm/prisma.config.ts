import { defineConfig } from 'prisma/config';
import path from 'node:path';

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: (process.env.DATABASE_URL_SUPERUSER ?? '') + '?schema=lab_crm',
  },
});
