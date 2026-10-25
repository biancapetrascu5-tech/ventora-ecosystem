/**
 * T2 — RLS direct (db-kit integration test)
 *
 * Necesită DATABASE_URL_TEST (PostgreSQL local sau serviciu CI).
 * Rulat în CI printr-un job separat cu services: postgres:17.
 * Verifică: izolare RLS, SET LOCAL ROLE, INSERT WITH CHECK blocat, NOLOGIN.
 *
 * @see docs/experiments/E10.md (validare originală pe staging)
 * @see .github/workflows/ci.yml (job integration-tests)
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env['DATABASE_URL_TEST'];

if (!url) {
  describe.skip('rls.integration (DATABASE_URL_TEST lipsă)', () => {
    it.skip('skip', () => {});
  });
} else {
  const schema = 'dbkit_rls_test';
  const role = 'dbkit_rls_rw';

  let adminClient: pg.Client;

  beforeAll(async () => {
    adminClient = new pg.Client({ connectionString: url });
    await adminClient.connect();

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

    // Rol NOLOGIN NOINHERIT — pattern D-DB-1
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

    // RLS — pattern D-SEC-1 (E5)
    await adminClient.query(`ALTER TABLE ${schema}.items ENABLE ROW LEVEL SECURITY`);
    await adminClient.query(`
      CREATE POLICY org_isolation ON ${schema}.items
        USING ("organizationId" = current_setting('app.organization_id', true))
        WITH CHECK ("organizationId" = current_setting('app.organization_id', true))
    `);

    // Date de test
    await adminClient.query(`
      INSERT INTO ${schema}.items (id, "organizationId", name) VALUES
        ('item-alpha-1', 'org-alpha', 'Alpha Item 1'),
        ('item-alpha-2', 'org-alpha', 'Alpha Item 2'),
        ('item-beta-1', 'org-beta', 'Beta Item 1')
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
  });

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

  describe('T2 — RLS direct cu SET LOCAL ROLE', () => {
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
