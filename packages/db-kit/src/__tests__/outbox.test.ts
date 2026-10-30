import { describe, expect, it, vi } from 'vitest';
import { outboxMigrationSql, sqlIdentifier, writeOutboxEvent } from '../outbox';
import { UUID_V7, uuidv7 } from '../uuidv7';

const TEST_EVENT = {
  type: 'test.thing.happened',
  version: 1,
  parse: (p: unknown) => {
    const v = p as { n?: unknown };
    if (typeof v?.n !== 'number') throw new Error('n must be a number');
    return { n: v.n };
  },
};
const ORG = '2f1b8c3e-4a5d-4e6f-8a7b-9c0d1e2f3a4b';

describe('uuidv7', () => {
  it('is a version 7 UUID, ordered by time', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(UUID_V7);
    expect(b).toMatch(UUID_V7);
    expect(a < b).toBe(true);
    expect(a.slice(0, 13)).toBe('018bcfe5-6800');
  });
});

describe('writeOutboxEvent', () => {
  it('validates the payload and writes the full envelope (Prisma tx)', async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(1) };
    const env = await writeOutboxEvent(tx, 'organizations', TEST_EVENT, {
      organizationId: ORG,
      sourceApp: 'platform',
      resourceId: 'r-1',
      payload: { n: 7 },
      correlationId: 'c-1',
    });
    expect(env.eventId).toMatch(UUID_V7);
    expect(env).toMatchObject({ type: 'test.thing.happened', version: 1, organizationId: ORG });
    const [sql, ...values] = tx.$executeRawUnsafe.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO organizations.outbox_events');
    expect(values).toEqual([
      env.eventId,
      'test.thing.happened',
      1,
      env.occurredAt,
      ORG,
      'platform',
      'r-1',
      'c-1',
      '{"n":7}',
    ]);
  });

  it('a payload that fails the catalog schema is never written', async () => {
    const client = { query: vi.fn() };
    await expect(
      writeOutboxEvent(client, 'organizations', TEST_EVENT, {
        organizationId: ORG,
        sourceApp: 'platform',
        resourceId: 'r-1',
        payload: { n: 'x' } as unknown as { n: number },
      }),
    ).rejects.toThrow('n must be a number');
    expect(client.query).not.toHaveBeenCalled();
  });

  it('refuses an unsafe schema name', async () => {
    await expect(
      writeOutboxEvent({ query: vi.fn() }, 'bad schema;', TEST_EVENT, {
        organizationId: ORG,
        sourceApp: 'platform',
        resourceId: 'r',
        payload: { n: 1 },
      }),
    ).rejects.toThrow('[db-kit] Schemă invalid');
  });
});

describe('outboxMigrationSql', () => {
  it('creates both tables with RLS (USING + WITH CHECK) for the module role', () => {
    const sql = outboxMigrationSql('organizations', 'org_rw');
    expect(sql).toContain('CREATE TABLE "organizations"."outbox_events"');
    expect(sql).toContain('CREATE TABLE "organizations"."processed_events"');
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(2);
    expect(sql.match(/WITH CHECK \(organization_id = /g)).toHaveLength(2);
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION "organizations".outbox_pending(INTEGER) TO org_rw',
    );
    expect(sql).toContain('REVOKE DELETE ON "organizations"."outbox_events" FROM org_rw');
  });

  it('refuses unsafe identifiers', () => {
    expect(() => outboxMigrationSql('x"; DROP', 'org_rw')).toThrow();
    expect(() => outboxMigrationSql('organizations', 'Org-RW')).toThrow();
    expect(sqlIdentifier('booking')).toBe('booking');
  });
});
