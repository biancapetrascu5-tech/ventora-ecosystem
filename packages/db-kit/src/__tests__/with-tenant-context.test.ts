import { describe, expect, it, vi } from 'vitest';
import type { TenantDb, TenantTx } from '../with-tenant-context';
import { withTenantContext } from '../with-tenant-context';

function makeMockDb() {
  const executedUnsafe: string[] = [];
  const executedRaw: string[] = [];

  const tx: TenantTx = {
    $executeRawUnsafe: vi.fn(async (q: string) => {
      executedUnsafe.push(q);
      return 0;
    }),
    $executeRaw: vi.fn(async (_strings: TemplateStringsArray) => {
      executedRaw.push('set_config');
      return 0;
    }),
  };

  const db: TenantDb = {
    $transaction: vi.fn(async (fn: (tx: TenantTx) => Promise<unknown>) => fn(tx)),
  } as unknown as TenantDb;

  return { db, tx, executedUnsafe, executedRaw };
}

describe('withTenantContext', () => {
  it('apelează SET LOCAL ROLE cu rolul validat', async () => {
    const { db, executedUnsafe } = makeMockDb();
    await withTenantContext(db, 'org-1', 'lab_catalog_rw', async () => 'ok');
    expect(executedUnsafe[0]).toBe('SET LOCAL ROLE lab_catalog_rw');
  });

  it('apelează set_config după SET LOCAL ROLE', async () => {
    const { db, executedRaw } = makeMockDb();
    await withTenantContext(db, 'org-1', 'lab_catalog_rw', async () => 'ok');
    expect(executedRaw[0]).toBe('set_config');
  });

  it('returnează rezultatul funcției fn', async () => {
    const { db } = makeMockDb();
    const result = await withTenantContext(db, 'org-1', 'lab_catalog_rw', async () => 42);
    expect(result).toBe(42);
  });

  it('aruncă eroare la nume de rol cu spații', async () => {
    const { db } = makeMockDb();
    await expect(withTenantContext(db, 'org-1', 'bad role', async () => 'x')).rejects.toThrow(
      /Nume de rol invalid/,
    );
  });

  it('aruncă eroare la rol cu majuscule', async () => {
    const { db } = makeMockDb();
    await expect(withTenantContext(db, 'org-1', 'BadRole', async () => 'x')).rejects.toThrow(
      /Nume de rol invalid/,
    );
  });

  it('aruncă eroare la tentativă SQL injection în rol', async () => {
    const { db } = makeMockDb();
    await expect(
      withTenantContext(db, 'org-1', 'role; DROP TABLE users', async () => 'x'),
    ).rejects.toThrow(/Nume de rol invalid/);
  });

  it('acceptă rol cu underscore și cifre', async () => {
    const { db } = makeMockDb();
    await expect(
      withTenantContext(db, 'org-1', 'lab_catalog_rw_2', async () => 'ok'),
    ).resolves.toBe('ok');
  });

  it('propagă erori din fn() fără să le înghită', async () => {
    const { db } = makeMockDb();
    const boom = new Error('DB exploded');
    await expect(
      withTenantContext(db, 'org-1', 'lab_catalog_rw', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
