import { describe, expect, it, vi } from 'vitest';
import type { OutboxEvent } from '../outbox-dispatcher';
import { processOutboxEvents } from '../outbox-dispatcher';

type Row = Record<string, unknown>;

function makeEvent(overrides: Partial<Row> = {}): Row {
  return {
    id: 'evt-1',
    eventType: 'test.created.v1',
    payload: { key: 'value' },
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function mockClient(rowsPerCall: Row[][]): {
  query: ReturnType<typeof vi.fn>;
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> };
} {
  let callIndex = 0;
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => {
    return { rows: rowsPerCall[callIndex++] ?? [] };
  });
  return { query, client: { query } };
}

describe('processOutboxEvents', () => {
  it('returnează 0 dacă nu sunt evenimente', async () => {
    const { client } = mockClient([[]]);
    const result = await processOutboxEvents(client, 'test_schema', vi.fn(), 10);
    expect(result).toBe(0);
  });

  it('procesează evenimentele și marchează processedAt', async () => {
    const { client, query } = mockClient([
      [makeEvent()],
      [], // UPDATE processedAt
    ]);
    const handler = vi.fn<(e: OutboxEvent) => Promise<void>>().mockResolvedValue(undefined);
    const result = await processOutboxEvents(client, 'test_schema', handler, 10);
    expect(result).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].id).toBe('evt-1');
    // A doua interogare: UPDATE cu processedAt
    expect(query.mock.calls[1][0]).toMatch(/processedAt.*attempts/);
  });

  it('la eșec handler: incrementează attempts, nu marchează processedAt', async () => {
    const { client, query } = mockClient([
      [makeEvent()],
      [], // UPDATE attempts
    ]);
    const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const result = await processOutboxEvents(client, 'test_schema', handler, 10);
    expect(result).toBe(0);
    // UPDATE la eșec: nu conține processedAt
    const updateSql = query.mock.calls[1][0] as string;
    expect(updateSql).toMatch(/attempts.*=.*attempts.*\+.*1/);
    expect(updateSql).not.toMatch(/processedAt/);
  });

  it('procesează mai multe evenimente independent', async () => {
    const events = [makeEvent({ id: 'evt-1' }), makeEvent({ id: 'evt-2' })];
    const calls: Row[] = [...events];
    const { client } = mockClient([calls, [], []]);
    const handler = vi.fn<(e: OutboxEvent) => Promise<void>>().mockResolvedValue(undefined);
    const result = await processOutboxEvents(client, 'test_schema', handler, 10);
    expect(result).toBe(2);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('eșecul unui eveniment nu oprește procesarea celorlalte', async () => {
    const events = [makeEvent({ id: 'evt-fail' }), makeEvent({ id: 'evt-ok' })];
    const { client } = mockClient([events, [], []]);
    const handler = vi
      .fn<(e: OutboxEvent) => Promise<void>>()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);
    const result = await processOutboxEvents(client, 'test_schema', handler, 10);
    expect(result).toBe(1);
  });

  it('aruncă eroare la schemă invalidă', async () => {
    const { client } = mockClient([]);
    await expect(processOutboxEvents(client, 'bad schema!', vi.fn(), 10)).rejects.toThrow(
      /Schemă invalidă/,
    );
  });
});
