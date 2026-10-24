import { defineConfig } from 'prisma/config';
import path from 'node:path';

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    // superuser for migrate (needs CREATEDB for shadow DB); app runtime uses DATABASE_URL_CORE
    url: (process.env.DATABASE_URL_SUPERUSER ?? '') + '?schema=lab_core',
  },
});
