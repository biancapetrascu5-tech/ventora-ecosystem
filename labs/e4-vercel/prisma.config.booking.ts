import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/booking.prisma',
  datasource: { url: process.env.DATABASE_URL_BOOKING ?? '' },
});
