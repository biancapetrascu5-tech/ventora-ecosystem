import { describe, expect, it, vi } from 'vitest';
import { confirmQuota } from '../confirm';
import { releaseQuota } from '../release';
import { reserveQuota } from '../reserve';

type Row = Record<string, unknown>;

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

describe('reserveQuota', () => {
  it('returnează ok:true cu reservationId la rezervare reușită', async () => {
    // 1. idempotency check → 0 rows
    // 2. UPDATE condiționat → 1 row (rezervare reușită)
    // 3. INSERT reservation → { id: 'res-1' }
    const { client } = mockClient([[], [{ id: 'counter-1' }], [{ id: 'res-1' }]]);
    const result = await reserveQuota(client, {
      organizationId: 'org-1',
      metric: 'bookings',
      amount: 1,
      operationId: 'op-1',
    });
    expect(result).toEqual({ ok: true, reservationId: 'res-1' });
  });

  it('returnează ok:false la quota_exceeded (UPDATE returnează 0 rânduri)', async () => {
    const { client } = mockClient([[], []]);
    const result = await reserveQuota(client, {
      organizationId: 'org-1',
      metric: 'bookings',
      amount: 999,
      operationId: 'op-2',
    });
    expect(result).toEqual({ ok: false, reason: 'quota_exceeded' });
  });

  it('returnează idempotent:true dacă operationId există deja (status=reserved)', async () => {
    const { client } = mockClient([[{ id: 'res-existing', status: 'reserved' }]]);
    const result = await reserveQuota(client, {
      organizationId: 'org-1',
      metric: 'bookings',
      amount: 1,
      operationId: 'op-existing',
    });
    expect(result).toEqual({ ok: true, reservationId: 'res-existing', idempotent: true });
  });

  it('returnează idempotent:true dacă operationId există deja (status=confirmed)', async () => {
    const { client } = mockClient([[{ id: 'res-confirmed', status: 'confirmed' }]]);
    const result = await reserveQuota(client, {
      organizationId: 'org-1',
      metric: 'bookings',
      amount: 1,
      operationId: 'op-confirmed',
    });
    expect(result).toEqual({ ok: true, reservationId: 'res-confirmed', idempotent: true });
  });
});

describe('confirmQuota', () => {
  it('returnează ok:true la confirmare reușită', async () => {
    const { client } = mockClient([
      [
        {
          id: 'res-1',
          status: 'reserved',
          amount: 1,
          organizationId: 'org-1',
          metric: 'bookings',
        },
      ],
      [],
      [],
    ]);
    const result = await confirmQuota(client, 'res-1');
    expect(result).toEqual({ ok: true });
  });

  it('returnează not_found la rezervare inexistentă', async () => {
    const { client } = mockClient([[]]);
    const result = await confirmQuota(client, 'nonexistent');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('idempotent: ok:true dacă deja confirmed', async () => {
    const { client } = mockClient([
      [
        {
          id: 'res-1',
          status: 'confirmed',
          amount: 1,
          organizationId: 'org-1',
          metric: 'bookings',
        },
      ],
    ]);
    const result = await confirmQuota(client, 'res-1');
    expect(result).toEqual({ ok: true });
  });

  it('returnează already_released dacă rezervarea e released', async () => {
    const { client } = mockClient([
      [
        {
          id: 'res-1',
          status: 'released',
          amount: 1,
          organizationId: 'org-1',
          metric: 'bookings',
        },
      ],
    ]);
    const result = await confirmQuota(client, 'res-1');
    expect(result).toEqual({ ok: false, reason: 'already_released' });
  });
});

describe('releaseQuota', () => {
  it('returnează ok:true la eliberare reușită', async () => {
    const { client } = mockClient([
      [
        {
          id: 'res-1',
          status: 'reserved',
          amount: 1,
          organizationId: 'org-1',
          metric: 'bookings',
        },
      ],
      [],
      [],
    ]);
    const result = await releaseQuota(client, 'res-1');
    expect(result).toEqual({ ok: true });
  });

  it('returnează not_found la rezervare inexistentă', async () => {
    const { client } = mockClient([[]]);
    const result = await releaseQuota(client, 'nonexistent');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('idempotent: ok:true dacă deja released', async () => {
    const { client } = mockClient([
      [
        {
          id: 'res-1',
          status: 'released',
          amount: 1,
          organizationId: 'org-1',
          metric: 'bookings',
        },
      ],
    ]);
    const result = await releaseQuota(client, 'res-1');
    expect(result).toEqual({ ok: true });
  });

  it('nu actualizează contorul dacă status e confirmed (nu reserved)', async () => {
    const { client, query } = mockClient([
      [
        {
          id: 'res-1',
          status: 'confirmed',
          amount: 1,
          organizationId: 'org-1',
          metric: 'bookings',
        },
      ],
      [],
    ]);
    await releaseQuota(client, 'res-1');
    // Apeluri: 1 SELECT + 1 UPDATE status (fără UPDATE counter)
    expect(query).toHaveBeenCalledTimes(2);
  });
});
