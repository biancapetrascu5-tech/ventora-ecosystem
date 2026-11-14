import { describe, expect, it } from 'vitest';
import { sendFounderNotification } from '../founder-inbox';
import type { SqlClient } from '../model/sql';

// FounderNotifications: the checks before anything reaches the database (the database rights
// and the dedup are in core/growth founder-notifications.integration.test.ts).

function fakeTx() {
  const sql: string[] = [];
  const tx: SqlClient = {
    async query(text: string) {
      sql.push(text);
      if (text.startsWith('SELECT current_user')) return { rows: [{ role: 'support_rw' }] };
      return { rows: [], rowCount: 1 };
    },
  };
  return { tx, sql };
}

const support = {
  type: 'founder.support.request_new' as const,
  params: {
    organizationId: '0195f1f0-0000-7000-8000-000000000001',
    applicationId: 'booking',
    subject: 'Avansul nu apare în fișa clientului',
    urgency: 'blocking',
    requestRef: 'VS-2026-0142',
  },
  idempotencyKey: 'r1',
  actionPath: '/support/VS-2026-0142',
};

describe('sendFounderNotification', () => {
  it('writes as notifications_rw, without RETURNING or ON CONFLICT, then gives the role back', async () => {
    const { tx, sql } = fakeTx();
    expect(await sendFounderNotification(tx, support)).toEqual({ created: true });
    expect(sql[1]).toBe('SET LOCAL ROLE notifications_rw');
    const insert = sql.find((s) => s.includes('INSERT INTO notifications.founder_notification'))!;
    expect(insert).not.toMatch(/RETURNING|ON CONFLICT/);
    expect(sql.at(-1)).toBe('SET LOCAL ROLE support_rw');
  });

  it('refuses an unknown type, a missing value, an object value, a bad path or key', async () => {
    const { tx, sql } = fakeTx();
    await expect(
      sendFounderNotification(tx, { ...support, type: 'founder.other' as never }),
    ).rejects.toThrow();
    await expect(
      sendFounderNotification(tx, { ...support, params: { ...support.params, subject: '' } }),
    ).rejects.toThrow(/subject/);
    await expect(
      sendFounderNotification(tx, {
        ...support,
        params: { ...support.params, extra: { a: 1 } as never },
      }),
    ).rejects.toThrow(/extra/);
    await expect(
      sendFounderNotification(tx, { ...support, actionPath: 'https://evil.example' }),
    ).rejects.toThrow();
    await expect(
      sendFounderNotification(tx, { ...support, idempotencyKey: ' ' }),
    ).rejects.toThrow();
    expect(sql).toEqual([]);
  });
});
