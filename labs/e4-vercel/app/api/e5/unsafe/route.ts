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
  // Demonstrates risk: set_config with local=false (session-level, not transaction-local).
  // With transaction pooler, Supavisor may or may not reset session vars between transactions.
  // Test: does the value persist across transaction boundaries on the same server connection?

  const contaminantOrg = 'e4-org-beta';

  // 1. Set org_id at SESSION level (local=false) — the unsafe pattern
  await db.$executeRaw`SELECT set_config('app.organization_id', ${contaminantOrg}, false)`;

  // 2. Value visible immediately on the same connection (before any new transaction)
  const [{ val: afterSet }] = await db.$queryRaw<[{ val: string | null }]>`
    SELECT current_setting('app.organization_id', true) AS val
  `;

  // 3. Start a NEW transaction — does the session setting leak in?
  let settingInsideNewTx: string | null = null;
  let servicesInNewTx: { id: string; organizationId: string }[] = [];
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
    // No set_config here — if session setting leaked, RLS will use contaminantOrg
    const [{ val }] = await tx.$queryRaw<[{ val: string | null }]>`
      SELECT current_setting('app.organization_id', true) AS val
    `;
    settingInsideNewTx = val;
    const svcs = await tx.service.findMany({ take: 10 });
    servicesInNewTx = svcs.map((s) => ({ id: s.id, organizationId: s.organizationId }));
  });

  // 4. After transaction — does session setting still persist?
  const [{ val: afterTx }] = await db.$queryRaw<[{ val: string | null }]>`
    SELECT current_setting('app.organization_id', true) AS val
  `;

  // 5. CLEANUP: reset the session setting to avoid contaminating subsequent requests
  await db.$executeRaw`SELECT set_config('app.organization_id', '', false)`;

  const contaminated = settingInsideNewTx === contaminantOrg;

  return Response.json({
    experiment: 'E5-unsafe',
    warning: 'SET session-level (local=false) — demonstrates contamination risk',
    contaminantOrg,
    settingAfterSet: afterSet,
    settingInsideNewTransaction: settingInsideNewTx,
    settingAfterTransaction: afterTx,
    servicesVisibleWithoutExplicitOrg: servicesInNewTx.length,
    servicesOrgs: [...new Set(servicesInNewTx.map((s) => s.organizationId))],
    contaminated,
    contaminationNote: contaminated
      ? 'RISC CONFIRMAT: setarea de sesiune a scurs in tranzactia urmatoare. Folositi intotdeauna set_config(..., true) (local=true).'
      : 'Supavisor a resetat variabila de sesiune intre tranzactii. SET fara LOCAL este aparent sigur in acest pooler, dar nu va bazati pe asta — folositi intotdeauna local=true.',
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
