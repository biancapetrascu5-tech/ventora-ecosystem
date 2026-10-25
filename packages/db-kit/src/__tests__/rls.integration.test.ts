/**
 * T1 + T2 — Integrare directă pe PostgreSQL (db-kit integration tests)
 *
 * Necesită DATABASE_URL_TEST (PostgreSQL local sau serviciu CI).
 * Rulat în CI printr-un job separat cu services: postgres:17.
 *
 * T1 — Cross-tenant isolation via withTenantContext (D-DB-1 varianta C)
 *   Fiecare operație din org A asupra datelor org B e refuzată sau returnează 0 rânduri,
 *   iar datele org B rămân intacte.
 *
 * T2 — RLS direct (SET LOCAL ROLE + set_config manual)
 *   Verifică izolarea RLS, INSERT WITH CHECK blocat, NOLOGIN.
 *
 * @see docs/experiments/E10.md
 * @see .github/workflows/ci.yml (job integration-tests)
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantDb, TenantTx } from '../with-tenant-context';
import { withTenantContext } from '../with-tenant-context';

const url = process.env['DATABASE_URL_TEST'];

if (!url) {
  describe.skip('rls.integration (DATABASE_URL_TEST lipsă)', () => {
    it.skip('skip', () => {});
  });
} else {
  const schema = 'dbkit_rls_test';
  const role = 'dbkit_rls_rw';

  let adminClient: pg.Client;
  let tenantClient: pg.Client;

  // ── Adapter pg.Client → TenantDb (pentru a testa withTenantContext pe Postgres real) ──
  function makePgTenantDb(client: pg.Client): TenantDb {
    return {
      $transaction: async <T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> => {
        await client.query('BEGIN');
        const tx: TenantTx = {
          $executeRawUnsafe: async (q: string, ...vals: unknown[]) => {
            await client.query(q, vals.length ? vals : undefined);
            return 0;
          },
          $executeRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
            let sql = '';
            const params: unknown[] = [];
            strings.forEach((str, i) => {
              sql += str;
              if (i < vals.length) {
                params.push(vals[i]);
                sql += `$${params.length}`;
              }
            });
            await client.query(sql, params.length ? params : undefined);
            return 0;
          },
          $queryRawUnsafe: async <T = unknown>(q: string, ...vals: unknown[]): Promise<T[]> => {
            const result = await client.query(q, vals.length ? vals : undefined);
            return result.rows as T[];
          },
        };
        try {
          const result = await fn(tx);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      },
    };
  }

  beforeAll(async () => {
    adminClient = new pg.Client({ connectionString: url });
    await adminClient.connect();

    tenantClient = new pg.Client({ connectionString: url });
    await tenantClient.connect();

    // Setup schema, tabele, rol, RLS
    await adminClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminClient.query(`CREATE SCHEMA ${schema}`);
    await adminClient.query(`
      CREATE TABLE ${schema}.items (
        id TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        name TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Rol NOLOGIN NOINHERIT — D-DB-1 varianta C
    await adminClient.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
          CREATE ROLE ${role} NOLOGIN NOINHERIT;
        END IF;
      END $$
    `);
    await adminClient.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await adminClient.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.items TO ${role}`);
    // Grant rol → utilizatorul curent (necesar pentru SET LOCAL ROLE în test)
    await adminClient.query(`
      DO $$ BEGIN
        EXECUTE format('GRANT ${role} TO %I', current_user);
      END $$
    `);

    // RLS — D-SEC-1
    await adminClient.query(`ALTER TABLE ${schema}.items ENABLE ROW LEVEL SECURITY`);
    await adminClient.query(`
      CREATE POLICY org_isolation ON ${schema}.items
        USING ("organizationId" = current_setting('app.organization_id', true))
        WITH CHECK ("organizationId" = current_setting('app.organization_id', true))
    `);

    // Date de test — două organizații
    await adminClient.query(`
      INSERT INTO ${schema}.items (id, "organizationId", name) VALUES
        ('item-alpha-1', 'org-alpha', 'Alpha Item 1'),
        ('item-alpha-2', 'org-alpha', 'Alpha Item 2'),
        ('item-beta-1',  'org-beta',  'Beta Item 1')
    `);
  });

  afterAll(async () => {
    await adminClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminClient.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
          EXECUTE format('REVOKE ${role} FROM %I', current_user);
          DROP ROLE ${role};
        END IF;
      END $$
    `);
    await adminClient.end();
    await tenantClient.end();
  });

  // ── T1 — Cross-tenant isolation via withTenantContext ──────────────────────────────
  describe('T1 — cross-tenant isolation via withTenantContext', () => {
    it('T1.1 org-alpha nu poate vedea datele org-beta', async () => {
      const db = makePgTenantDb(tenantClient);
      const rows = await withTenantContext(db, 'org-alpha', role, async (tx) => {
        return tx.$queryRawUnsafe<{ id: string; organizationId: string }>(
          `SELECT id, "organizationId" FROM ${schema}.items`,
        );
      });
      expect(rows.every((r) => r.organizationId === 'org-alpha')).toBe(true);
      expect(rows.some((r) => r.organizationId === 'org-beta')).toBe(false);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('T1.2 org-beta nu poate vedea datele org-alpha', async () => {
      const db = makePgTenantDb(tenantClient);
      const rows = await withTenantContext(db, 'org-beta', role, async (tx) => {
        return tx.$queryRawUnsafe<{ id: string; organizationId: string }>(
          `SELECT id, "organizationId" FROM ${schema}.items`,
        );
      });
      expect(rows.every((r) => r.organizationId === 'org-beta')).toBe(true);
      expect(rows.some((r) => r.organizationId === 'org-alpha')).toBe(false);
      expect(rows.length).toBe(1);
    });

    it('T1.3 INSERT cross-org (org-alpha încearcă să scrie pentru org-beta) e blocat', async () => {
      const db = makePgTenantDb(tenantClient);
      await expect(
        withTenantContext(db, 'org-alpha', role, async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO ${schema}.items (id, "organizationId", name)
             VALUES ('t1-inject', 'org-beta', 'Cross-org inject attempt')`,
          );
        }),
      ).rejects.toThrow(/policy|violat|check/i);
    });

    it('T1.4 datele org-beta rămân intacte după tentativa din T1.3', async () => {
      const { rows } = await adminClient.query(
        `SELECT id FROM ${schema}.items WHERE "organizationId" = 'org-beta'`,
      );
      expect(rows.map((r: { id: string }) => r.id)).toEqual(['item-beta-1']);
    });

    it('T1.5 context gol → 0 rânduri vizibile (eșec sigur)', async () => {
      const db = makePgTenantDb(tenantClient);
      const rows = await withTenantContext(db, '', role, async (tx) => {
        return tx.$queryRawUnsafe<{ id: string }>(`SELECT id FROM ${schema}.items`);
      });
      expect(rows.length).toBe(0);
    });
  });

  // ── T2 — RLS direct cu SET LOCAL ROLE manual ───────────────────────────────────────
  describe('T2 — RLS direct cu SET LOCAL ROLE', () => {
    async function withTx(
      client: pg.Client,
      fn: (c: pg.Client) => Promise<unknown>,
    ): Promise<unknown> {
      await client.query('BEGIN');
      try {
        const r = await fn(client);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }

    it('T2.1 SET ROLE + org_alpha: vizibil doar org-alpha', async () => {
      const rows = (await withTx(adminClient, async (c) => {
        await c.query(`SELECT set_config('app.organization_id', 'org-alpha', true)`);
        await c.query(`SET LOCAL ROLE ${role}`);
        const { rows } = await c.query(`SELECT id, "organizationId" FROM ${schema}.items`);
        return rows;
      })) as Array<{ organizationId: string }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.organizationId === 'org-alpha')).toBe(true);
    });

    it('T2.2 set_config gol → 0 rânduri', async () => {
      const rows = (await withTx(adminClient, async (c) => {
        await c.query(`SELECT set_config('app.organization_id', '', true)`);
        await c.query(`SET LOCAL ROLE ${role}`);
        const { rows } = await c.query(`SELECT id FROM ${schema}.items`);
        return rows;
      })) as unknown[];
      expect(rows.length).toBe(0);
    });

    it('T2.3 SET ROLE + org_beta: vizibil doar org-beta', async () => {
      const rows = (await withTx(adminClient, async (c) => {
        await c.query(`SELECT set_config('app.organization_id', 'org-beta', true)`);
        await c.query(`SET LOCAL ROLE ${role}`);
        const { rows } = await c.query(`SELECT id, "organizationId" FROM ${schema}.items`);
        return rows;
      })) as Array<{ organizationId: string }>;
      expect(rows.length).toBe(1);
      expect(rows.every((r) => r.organizationId === 'org-beta')).toBe(true);
    });

    it('T2.4 INSERT cross-org blocat de WITH CHECK', async () => {
      await expect(
        withTx(adminClient, async (c) => {
          await c.query(`SELECT set_config('app.organization_id', 'org-alpha', true)`);
          await c.query(`SET LOCAL ROLE ${role}`);
          await c.query(
            `INSERT INTO ${schema}.items (id, "organizationId", name)
             VALUES ('inject-test', 'org-beta', 'Cross-org inject')`,
          );
        }),
      ).rejects.toThrow(/policy|violat|check/i);
    });

    it('T2.5 rolul NOLOGIN nu se poate autentifica direct', async () => {
      const badUrl = url.replace(/\/\/[^:]+:[^@]+@/, `//${role}:@`);
      const badClient = new pg.Client({
        connectionString: badUrl,
        connectionTimeoutMillis: 3000,
      });
      await expect(badClient.connect()).rejects.toThrow();
    });
  });
}
