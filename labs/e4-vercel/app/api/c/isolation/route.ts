import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/runtime-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

const pool = new Pool({ connectionString: process.env.DATABASE_URL_RUNTIME, max: 1 });
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

  // 3. After transaction: role must have reverted to lab_runtime (NOINHERIT)
  const [{ current_user: roleAfterTx }] = await db.$queryRaw<[{ current_user: string }]>`
    SELECT current_user
  `;
  checks.roleAfterTx = roleAfterTx;

  // 4. lab_crm is also inaccessible from lab_runtime directly (NOINHERIT)
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
      crmInaccessibleFromRuntime,
      setLocalRoleRevertsCorrectly: roleAfterTx === connectRole,
    },
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
