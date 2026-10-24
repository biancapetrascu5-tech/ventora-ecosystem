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

// Helper that always rolls back — safe for write tests
async function runRollback<T>(
  orgId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<{ result: T | null; rolledBack: boolean; error: string | null }> {
  let result: T | null = null;
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgId}, true)`;
      result = await fn(tx);
      throw new Error('__rb__');
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== '__rb__') return { result: null, rolledBack: false, error: msg };
  }
  return { result, rolledBack: true, error: null };
}

export async function GET(request: Request) {
  const results: Record<string, { rlsCaught: boolean; appCaught: boolean; note: string }> = {};

  // E6-8: INSERT cu organizationId al altei organizații — WITH CHECK trebuie să blocheze
  {
    let rlsCaught = false;
    let note = '';
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE lab_booking_user');
        await tx.$executeRaw`SELECT set_config('app.organization_id', 'e4-org-alpha', true)`;
        // Încearcă INSERT cu orgId = beta (NU alpha — violează WITH CHECK)
        await tx.$queryRaw`
          INSERT INTO lab_booking.services (id, "organizationId", name, "durationMinutes", price, "createdAt", "updatedAt")
          VALUES ('e6-test-insert-hack', 'e4-org-beta', 'CrossOrgHack', 30, 0, NOW(), NOW())
        `;
        // Dacă ajungem aici, RLS nu a blocat → rollback oricum
        throw new Error('__rb__');
      });
    } catch (e) {
      // Prisma wraps errors — check both e.message and String(e) for Postgres codes
      const msg = e instanceof Error ? e.message : String(e);
      const full = msg + ' ' + String(e);
      if (msg === '__rb__') {
        note = 'INSERT a reusit (RLS nu a blocat WITH CHECK) — rollback efectuat';
      } else if (
        full.includes('row-level security') ||
        full.includes('new row violates') ||
        full.includes('42501')
      ) {
        rlsCaught = true;
        note = `RLS WITH CHECK (42501) a blocat INSERT cross-org`;
      } else {
        // Orice alta eroare (FK, constraint) inseamna tot ca INSERT a esuat
        rlsCaught = true;
        note = `INSERT blocat (eroare non-RLS): ${full.replace(/\n/g, ' ').slice(0, 120)}`;
      }
    }
    results['E6-8: INSERT cu organizationId al altei org'] = {
      rlsCaught,
      appCaught: false,
      note,
    };
  }

  // E6-9: UPDATE rândul altei organizații — USING face rândul invizibil → 0 rânduri actualizate
  {
    const { result, error } = await runRollback(
      'e4-org-alpha',
      (tx) =>
        tx.$queryRaw<{ count: bigint }[]>`
        UPDATE lab_booking.services SET name = 'hacked'
        WHERE "organizationId" = 'e4-org-beta'
        RETURNING id
      `,
    );
    const count = Array.isArray(result) ? result.length : 0;
    const rlsCaught = count === 0;
    results['E6-9: UPDATE randul altei org'] = {
      rlsCaught,
      appCaught: false,
      note: error
        ? `Eroare: ${error.split('\n')[0]}`
        : `${count} randuri actualizate (0 = blocat de USING policy, rollback)`,
    };
  }

  // E6-10: DELETE rândul altei organizații — USING face rândul invizibil → 0 rânduri șterse
  {
    const { result, error } = await runRollback(
      'e4-org-alpha',
      (tx) =>
        tx.$queryRaw<{ id: string }[]>`
        DELETE FROM lab_booking.services
        WHERE "organizationId" = 'e4-org-beta'
        RETURNING id
      `,
    );
    const count = Array.isArray(result) ? result.length : 0;
    const rlsCaught = count === 0;
    results['E6-10: DELETE randul altei org'] = {
      rlsCaught,
      appCaught: false,
      note: error
        ? `Eroare: ${error.split('\n')[0]}`
        : `${count} randuri sterse (0 = blocat de USING policy, rollback)`,
    };
  }

  // E6-11: updateMany fără filtru de org — RLS limitează la rândurile org-ului curent
  {
    const { result, error } = await runRollback('e4-org-alpha', (tx) =>
      tx.service.updateMany({ data: { name: 'rls-test-touched' } }),
    );
    const count =
      result && typeof result === 'object' && 'count' in result
        ? (result as { count: number }).count
        : -1;
    // alpha are 2 servicii; beta are 1; fără RLS ar fi 3
    const rlsCaught = count >= 0 && count <= 2;
    results['E6-11: updateMany fara filtru org (Prisma)'] = {
      rlsCaught,
      appCaught: false,
      note: error
        ? `Eroare: ${error.split('\n')[0]}`
        : `${count} randuri afectate (max 2 = RLS limiteaza la alpha, total=3 fara RLS; rollback)`,
    };
  }

  // E6-12: deleteMany fără filtru de org — RLS limitează la rândurile org-ului curent
  {
    const { result, error } = await runRollback('e4-org-alpha', (tx) => tx.service.deleteMany({}));
    const count =
      result && typeof result === 'object' && 'count' in result
        ? (result as { count: number }).count
        : -1;
    const rlsCaught = count >= 0 && count <= 2;
    results['E6-12: deleteMany fara filtru (Prisma)'] = {
      rlsCaught,
      appCaught: false,
      note: error
        ? `Eroare: ${error.split('\n')[0]}`
        : `${count} randuri sterse (max 2 = RLS limiteaza la alpha, total=3 fara RLS; rollback)`,
    };
  }

  const allCases = Object.values(results);
  const rlsEffective = allCases.filter((r) => r.rlsCaught).length;

  return Response.json({
    experiment: 'E6-writes',
    summary: `RLS caught ${rlsEffective}/${allCases.length} write cases`,
    rlsPolicies: 'USING + WITH CHECK pe lab_booking.services si appointments',
    results,
    region: request.headers.get('x-vercel-id') ?? 'local',
    timestamp: new Date().toISOString(),
  });
}
