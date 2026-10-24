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
  const checks: Record<string, unknown> = {};

  // 1. Connect role before any transaction
  const [{ current_user: connectRole }] = await db.$queryRaw<[{ current_user: string }]>`
    SELECT current_user
  `;
  checks.connectRole = connectRole;

  // 2. Inside transaction with SET LOCAL ROLE lab_booking_user:
  //    - current_user should be lab_booking_user
  //    - can read lab_booking.services (should succeed)
  //    - cannot read lab_crm.contacts (should be permission denied)
  let bookingRoleInsideTx: string | null = null;
  let bookingAccessOk: boolean | null = null;
  let crmAccessDenied: boolean | null = null;
  let crmError: string | null = null;

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');

    const [{ current_user: roleInTx }] = await tx.$queryRaw<[{ current_user: string }]>`
      SELECT current_user
    `;
    bookingRoleInsideTx = roleInTx;

    // Access lab_booking — should succeed
    try {
      await tx.service.findMany({ take: 1 });
      bookingAccessOk = true;
    } catch {
      bookingAccessOk = false;
    }

    // Access lab_crm directly from booking role — must be denied
    try {
      await tx.$queryRaw`SELECT COUNT(*) FROM lab_crm.contacts`;
      crmAccessDenied = false;
    } catch (e: unknown) {
      crmAccessDenied = true;
      crmError = e instanceof Error ? e.message : String(e);
    }
  });

  // 3. After transaction: role must have reverted to lab_runtime (NOINHERIT).
  //    A subsequent request without SET LOCAL ROLE must NOT have module-role permissions.
  const [{ current_user: roleAfterTx }] = await db.$queryRaw<[{ current_user: string }]>`
    SELECT current_user
  `;

  // lab_booking inaccessible from lab_runtime without SET ROLE (NOINHERIT proves membership alone is not enough)
  let bookingInaccessibleFromRuntime: boolean | null = null;
  let bookingAfterTxError: string | null = null;
  try {
    await db.$queryRaw`SELECT COUNT(*) FROM lab_booking.services`;
    bookingInaccessibleFromRuntime = false;
  } catch (e: unknown) {
    bookingInaccessibleFromRuntime = true;
    bookingAfterTxError = e instanceof Error ? e.message : String(e);
  }

  // lab_crm inaccessible from lab_runtime directly (same check, different schema)
  let crmInaccessibleFromRuntime: boolean | null = null;
  try {
    await db.$queryRaw`SELECT COUNT(*) FROM lab_crm.contacts`;
    crmInaccessibleFromRuntime = false;
  } catch {
    crmInaccessibleFromRuntime = true;
  }

  const isolationOk =
    bookingRoleInsideTx === 'lab_booking_user' &&
    bookingAccessOk === true &&
    crmAccessDenied === true &&
    roleAfterTx === connectRole &&
    bookingInaccessibleFromRuntime === true &&
    crmInaccessibleFromRuntime === true;

  return Response.json({
    variant: 'C',
    module: 'isolation',
    isolationOk,
    checks: {
      connectRole,
      bookingRoleInsideTx,
      bookingAccessOk,
      crmAccessDeniedFromBookingRole: crmAccessDenied,
      crmErrorMessage: crmError,
      roleAfterTx,
      setLocalRoleRevertsCorrectly: roleAfterTx === connectRole,
      bookingInaccessibleFromRuntimeAfterTx: bookingInaccessibleFromRuntime,
      bookingAfterTxError,
      crmInaccessibleFromRuntime,
    },
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
