import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/multi-client';

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('pgbouncer');
    u.searchParams.delete('connection_limit');
    return u.toString();
  } catch {
    return url;
  }
}

const pool = new Pool({
  connectionString: cleanUrl(process.env.DATABASE_URL_MULTI ?? ''),
  max: 5,
});
const adapter = new PrismaPg(pool);
export const db = new PrismaClient({ adapter });
