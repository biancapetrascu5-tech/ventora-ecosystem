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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org') ?? 'e4-org-alpha';
  const otherOrgId = orgId === 'e4-org-alpha' ? 'e4-org-beta' : 'e4-org-alpha';

  const t0 = performance.now();
  let settingBeforeTx: string | null = null;
  let settingInsideTx: string | null = null;
  let settingAfterTx: string | null = null;
  let servicesForOrg: { id: string; organizationId: string; name: string }[] = [];
  let crossOrgVisible = false;

  // Check setting before transaction — should be NULL (transaction pooler resets between tx)
  const [{ val: beforeVal }] = await db.$queryRaw<[{ val: string | null }]>`
    SELECT current_setting('app.organization_id', true) AS val
  `;
  settingBeforeTx = beforeVal;

  await db.$transaction(async (tx) => {
    // C mechanism: SET LOCAL ROLE + set_config with local=true (transaction-scoped)
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgId}, true)`;

    const [{ val: insideVal }] = await tx.$queryRaw<[{ val: string | null }]>`
      SELECT current_setting('app.organization_id', true) AS val
    `;
    settingInsideTx = insideVal;

    // RLS filters automatically — only orgId rows visible even without WHERE clause
    const svcs = await tx.service.findMany();
    servicesForOrg = svcs.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      name: s.name,
    }));

    // Attempt to read other org's data explicitly — RLS blocks at row level
    const otherSvcs = await tx.service.findMany({ where: { organizationId: otherOrgId } });
    crossOrgVisible = otherSvcs.length > 0;
  });

  // Check setting after transaction — set_config(local=true) reverts with transaction end
  const [{ val: afterVal }] = await db.$queryRaw<[{ val: string | null }]>`
    SELECT current_setting('app.organization_id', true) AS val
  `;
  settingAfterTx = afterVal;

  const latencyMs = Math.round(performance.now() - t0);
  const isolationOk = !crossOrgVisible && settingAfterTx === null && settingInsideTx === orgId;

  return Response.json({
    experiment: 'E5-safe',
    orgId,
    isolationOk,
    rlsActive: true,
    mechanism: 'SET LOCAL ROLE lab_booking_user + set_config(app.organization_id, local=true)',
    servicesReturned: servicesForOrg.length,
    services: servicesForOrg,
    crossOrgDataVisible: crossOrgVisible,
    settingBeforeTx,
    settingInsideTx,
    settingAfterTx,
    settingRevertsAfterTx: settingAfterTx === null,
    latencyMs,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
