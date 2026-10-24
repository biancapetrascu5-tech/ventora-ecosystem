import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/runtime-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

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
  max: 1,
});
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function runWithOrg<T>(orgId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgId}, true)`;
    return fn(tx);
  });
}

export async function GET(request: Request) {
  const results: Record<string, { rlsCaught: boolean; appCaught: boolean; note: string }> = {};

  // E6-1: SELECT without org filter — RLS returns only rows for current org
  try {
    const rows = await runWithOrg('e4-org-alpha', (tx) => tx.service.findMany());
    const crossOrg = rows.some((r) => r.organizationId !== 'e4-org-alpha');
    results['E6-1: SELECT without explicit org filter'] = {
      rlsCaught: !crossOrg,
      appCaught: false,
      note: `RLS filtered to ${rows.length} rows; cross-org visible: ${crossOrg}`,
    };
  } catch (e) {
    results['E6-1: SELECT without explicit org filter'] = {
      rlsCaught: true,
      appCaught: false,
      note: String(e),
    };
  }

  // E6-2: SELECT with correct org filter — should succeed
  try {
    const rows = await runWithOrg('e4-org-alpha', (tx) =>
      tx.service.findMany({ where: { organizationId: 'e4-org-alpha' } }),
    );
    results['E6-2: SELECT with correct org filter'] = {
      rlsCaught: false,
      appCaught: false,
      note: `OK — ${rows.length} rows returned for e4-org-alpha`,
    };
  } catch (e) {
    results['E6-2: SELECT with correct org filter'] = {
      rlsCaught: false,
      appCaught: false,
      note: String(e),
    };
  }

  // E6-3: SELECT cross-org — RLS blocks row visibility
  try {
    const rows = await runWithOrg('e4-org-alpha', (tx) =>
      tx.service.findMany({ where: { organizationId: 'e4-org-beta' } }),
    );
    results['E6-3: SELECT cross-org (filter for other org)'] = {
      rlsCaught: rows.length === 0,
      appCaught: false,
      note: `RLS returned ${rows.length} rows (0 = blocked by RLS)`,
    };
  } catch (e) {
    results['E6-3: SELECT cross-org (filter for other org)'] = {
      rlsCaught: true,
      appCaught: false,
      note: String(e),
    };
  }

  // E6-4: COUNT(*) without filter — RLS filters before aggregation
  try {
    type CountRow = { count: bigint };
    const [{ count }] = await runWithOrg(
      'e4-org-alpha',
      (tx) => tx.$queryRaw<CountRow[]>`SELECT COUNT(*) as count FROM lab_booking.services`,
    );
    const totalCount = Number(count);
    // alpha has 2 services, beta has 1 — with RLS: count = 2, not 3
    results['E6-4: COUNT(*) without filter'] = {
      rlsCaught: totalCount <= 2,
      appCaught: false,
      note: `COUNT returned ${totalCount} (expected ≤2 for alpha; total rows = 3 — RLS ${totalCount <= 2 ? 'filtered correctly' : 'DID NOT filter'})`,
    };
  } catch (e) {
    results['E6-4: COUNT(*) without filter'] = {
      rlsCaught: false,
      appCaught: false,
      note: String(e),
    };
  }

  // E6-5: Raw SQL SELECT (bypasses Prisma model layer) — RLS still applies
  try {
    type SvcRow = { id: string; organizationId: string };
    const rows = await runWithOrg(
      'e4-org-alpha',
      (tx) => tx.$queryRaw<SvcRow[]>`SELECT id, "organizationId" FROM lab_booking.services`,
    );
    const crossOrg = rows.some((r) => r.organizationId !== 'e4-org-alpha');
    results['E6-5: Raw SQL SELECT (bypasses Prisma model guard)'] = {
      rlsCaught: !crossOrg,
      appCaught: false,
      note: `${rows.length} rows; cross-org: ${crossOrg}. RLS applies even to raw SQL.`,
    };
  } catch (e) {
    results['E6-5: Raw SQL SELECT (bypasses Prisma model guard)'] = {
      rlsCaught: true,
      appCaught: false,
      note: String(e),
    };
  }

  // E6-6: Wrong org-id in context — caller error, RLS enforces wrong org's view
  try {
    const rows = await runWithOrg('e4-org-beta', (tx) => tx.service.findMany());
    results['E6-6: Wrong org-id in context (intentional)'] = {
      rlsCaught: false,
      appCaught: false,
      note: `With org=beta: ${rows.length} rows (beta has 1 service). RLS enforces whatever org-id is set — caller must pass correct id.`,
    };
  } catch (e) {
    results['E6-6: Wrong org-id in context (intentional)'] = {
      rlsCaught: false,
      appCaught: false,
      note: String(e),
    };
  }

  // E6-7: No org-id set — RLS returns 0 rows (secure default: NULL matches nothing)
  try {
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
      // No set_config — app.organization_id is NULL/empty
      return tx.service.findMany();
    });
    results['E6-7: No org-id in context (missing set_config)'] = {
      rlsCaught: rows.length === 0,
      appCaught: false,
      note: `${rows.length} rows returned. NULL org_id → 0 rows (secure default: ${rows.length === 0 ? 'YES' : 'NO'})`,
    };
  } catch (e) {
    results['E6-7: No org-id in context (missing set_config)'] = {
      rlsCaught: true,
      appCaught: false,
      note: String(e),
    };
  }

  const allCases = Object.values(results);
  const rlsEffective = allCases.filter((r) => r.rlsCaught).length;

  return Response.json({
    experiment: 'E6',
    summary: `RLS caught ${rlsEffective}/${allCases.length} cases`,
    results,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
