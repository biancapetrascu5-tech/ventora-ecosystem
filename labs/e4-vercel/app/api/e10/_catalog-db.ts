// Client Prisma pentru lab_catalog prin lab_runtime (varianta C, E4)
// SET LOCAL ROLE lab_catalog_rw + set_config('app.organization_id', ..., true) per tranzacție
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/runtime-client';

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
  connectionString: cleanUrl(process.env.DATABASE_URL_RUNTIME ?? ''),
  max: 5,
});
const adapter = new PrismaPg(pool);
export const runtimeDb = new PrismaClient({ adapter });

// Execută o operație în contextul organizației, cu rolul lab_catalog_rw
// Varianta C (E4): SET LOCAL ROLE + set_config transaction-local (E5)
export async function withCatalogContext<T>(
  organizationId: string,
  fn: (
    tx: Omit<
      PrismaClient,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
    >,
  ) => Promise<T>,
): Promise<T> {
  return runtimeDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_catalog_rw');
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return fn(tx);
  });
}
