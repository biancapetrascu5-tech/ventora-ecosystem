import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import type { ApplicationManifest } from '@ventora/contracts';
import { InvalidInput, UnknownCommercialKey } from '@ventora/errors';
import {
  APPLICATIONS,
  assertKnownKeys,
  closeCommercialPools,
  getRegistry,
  isNoop,
  syncRegistry,
} from '../index';

// Lot 3.1 — „Gata când”: the sync run twice gives the same result; a key gone from the manifest
// is retired, not deleted; Founder cannot set values for keys that do not exist. Runs on the
// access test DB, where commercial_init is applied (scripts/test-db-up.mjs). Test manifests,
// not the real ones: test-integration.mjs runs the real sync script afterwards.

const adminPool = new Pool({ connectionString: process.env.DIRECT_URL, max: 2 });
let admin: PoolClient;

const bookingManifest: ApplicationManifest = {
  applicationId: 'booking',
  permissions: [],
  defaultGrants: {},
  features: [{ key: 'booking.sms.ownNumber', description: 'own phone' }],
  quotas: [
    {
      key: 'booking.appointments',
      kind: 'flow',
      unit: 'appointment',
      period: 'month',
      overflow: 'block',
      refundable: true,
    },
    {
      key: 'booking.sms.devices',
      kind: 'stock',
      unit: 'device',
      period: null,
      overflow: 'block',
      refundable: false,
    },
  ],
};

const platformManifest: ApplicationManifest = {
  applicationId: 'platform',
  permissions: [],
  defaultGrants: {},
  quotas: [
    {
      key: 'platform.members',
      kind: 'stock',
      unit: 'member',
      period: null,
      overflow: 'block',
      refundable: false,
    },
  ],
};

const rows = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const snapshot = () =>
  rows(
    `SELECT 'q' AS t, key AS id, application_id AS app, kind, unit, period, refundable,
            retired_at IS NOT NULL AS retired, updated_at
       FROM commercial.quota_key
     UNION ALL
     SELECT 'f', key, application_id, NULL, NULL, NULL, NULL, retired_at IS NOT NULL, updated_at
       FROM commercial.feature_key
     UNION ALL
     SELECT 'a', id, name, NULL, NULL, NULL, NULL, retired_at IS NOT NULL, updated_at
       FROM commercial.application
     ORDER BY 1, 2`,
  );

beforeAll(async () => {
  admin = await adminPool.connect();
});

beforeEach(async () => {
  // Lot 3.2: plans, add-ons and exceptions reference the keys, and published versions refuse
  // DELETE (trigger); TRUNCATE … CASCADE clears the whole commercial model without row triggers.
  await admin.query(
    'TRUNCATE commercial.quota_key, commercial.feature_key, commercial.application CASCADE',
  );
});

afterAll(async () => {
  admin.release();
  await adminPool.end();
  await closeCommercialPools();
});

describe('Lot 3.1 — the registry sync', () => {
  it('first run writes the 16 applications and the declared keys', async () => {
    const r = await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
    expect(r.applications.inserted).toHaveLength(16);
    expect(r.quotas.inserted.sort()).toEqual([
      'booking.appointments',
      'booking.sms.devices',
      'platform.members',
    ]);
    expect(r.features.inserted).toEqual(['booking.sms.ownNumber']);
    const [q] = await rows(`SELECT * FROM commercial.quota_key WHERE key = 'booking.appointments'`);
    expect(q).toMatchObject({
      application_id: 'booking',
      kind: 'flow',
      unit: 'appointment',
      period: 'month',
      overflow: 'block',
      refundable: true,
      retired_at: null,
    });
  });

  it('run twice gives the same result: the second writes nothing, not even updated_at', async () => {
    await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
    const before = await snapshot();
    const second = await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
    expect(isNoop(second)).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('a key gone from the manifest is retired, not deleted; declared again, it comes back', async () => {
    await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
    const withoutDevices = {
      ...bookingManifest,
      quotas: bookingManifest.quotas!.filter((q) => q.key !== 'booking.sms.devices'),
    };
    const r = await syncRegistry(admin, APPLICATIONS, [platformManifest, withoutDevices]);
    expect(r.quotas.retired).toEqual(['booking.sms.devices']);
    const [retired] = await rows(
      `SELECT retired_at FROM commercial.quota_key WHERE key = 'booking.sms.devices'`,
    );
    expect(retired!.retired_at).toBeInstanceOf(Date);
    expect((await getRegistry('app')).quotas.map((q) => q.key)).not.toContain(
      'booking.sms.devices',
    );

    // retired stays retired on the next run (idempotent), then comes back when declared
    expect(
      isNoop(await syncRegistry(admin, APPLICATIONS, [platformManifest, withoutDevices])),
    ).toBe(true);
    const back = await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
    expect(back.quotas.updated).toEqual(['booking.sms.devices']);
    expect((await getRegistry('app')).quotas.map((q) => q.key)).toContain('booking.sms.devices');
  });

  it('a key taken over by a new module moves its owner, the key stays', async () => {
    await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
    const hub = { ...platformManifest, quotas: [] };
    const moved = {
      ...bookingManifest,
      quotas: [...bookingManifest.quotas!, ...platformManifest.quotas!],
    };
    const r = await syncRegistry(admin, APPLICATIONS, [hub, moved]);
    expect(r.quotas.updated).toEqual(['platform.members']);
    expect(r.quotas.retired).toEqual([]);
    const [q] = await rows(
      `SELECT application_id FROM commercial.quota_key WHERE key = 'platform.members'`,
    );
    expect(q!.application_id).toBe('booking');
  });

  it('a run that fails half-way writes nothing (one transaction)', async () => {
    await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
    const before = await snapshot();
    // passes the manifest check, fails in the database (VARCHAR(128)) after earlier writes
    const tooLong = `booking.${'a'.repeat(130)}`;
    const bad: ApplicationManifest = {
      ...bookingManifest,
      features: [{ key: 'booking.newFeature' }],
      quotas: [...bookingManifest.quotas!, { ...bookingManifest.quotas![0]!, key: tooLong }],
    };
    await expect(syncRegistry(admin, APPLICATIONS, [platformManifest, bad])).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it('a manifest the check refuses is refused before any write', async () => {
    const bad: ApplicationManifest = {
      ...bookingManifest,
      quotas: [{ ...bookingManifest.quotas![0]!, period: null }],
    };
    await expect(syncRegistry(admin, APPLICATIONS, [bad])).rejects.toThrow(/needs period/);
    expect(await snapshot()).toEqual([]);
  });

  it('the CHECKs refuse what the manifest check would (a stock quota with a period)', async () => {
    await syncRegistry(admin, APPLICATIONS, [platformManifest]);
    await expect(
      admin.query(
        `INSERT INTO commercial.quota_key (key, application_id, kind, unit, period, overflow)
         VALUES ('platform.locations', 'platform', 'stock', 'location', 'month', 'block')`,
      ),
    ).rejects.toThrow(/quota_key_period/);
  });
});

describe('Lot 3.1 — Founder cannot set values for keys that do not exist', () => {
  beforeEach(async () => {
    await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
  });

  it('known keys and limits (a number or null = unlimited) pass', async () => {
    await expect(
      assertKnownKeys({
        features: ['booking.sms.ownNumber'],
        quotas: { 'booking.appointments': 200, 'platform.members': null },
      }),
    ).resolves.toBeUndefined();
  });

  it('a key that no manifest declares is refused, with every bad key named', async () => {
    const err = await assertKnownKeys({
      features: ['booking.sms.ownNumber', 'booking.magic'],
      quotas: { 'booking.appointments': 10, 'crm.contacts': 500 },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnknownCommercialKey);
    expect((err as UnknownCommercialKey).keys).toEqual(['booking.magic', 'crm.contacts']);
  });

  it('a feature key is not a quota key: the namespaces are separate', async () => {
    await expect(assertKnownKeys({ quotas: { 'booking.sms.ownNumber': 1 } })).rejects.toThrow(
      UnknownCommercialKey,
    );
  });

  it('a retired key is refused too', async () => {
    await syncRegistry(admin, APPLICATIONS, [
      platformManifest,
      { ...bookingManifest, quotas: [bookingManifest.quotas![0]!] },
    ]);
    await expect(assertKnownKeys({ quotas: { 'booking.sms.devices': 2 } })).rejects.toThrow(
      UnknownCommercialKey,
    );
  });

  it('a limit that is not a whole number ≥ 0 is refused before the database', async () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      await expect(assertKnownKeys({ quotas: { 'booking.appointments': bad } })).rejects.toThrow(
        InvalidInput,
      );
    }
  });
});

describe('Lot 3.1 — the runtime roles only read the registry', () => {
  beforeEach(async () => {
    await syncRegistry(admin, APPLICATIONS, [platformManifest, bookingManifest]);
  });

  it('app_runtime reads it through commercial_rw', async () => {
    const reg = await getRegistry('app');
    expect(reg.applications).toHaveLength(16);
    expect(reg.applications[0]).toEqual({ id: 'platform', name: 'Ventora Hub', isPlatform: true });
    expect(reg.quotas.map((q) => q.key)).toEqual([
      'booking.appointments',
      'booking.sms.devices',
      'platform.members',
    ]);
  });

  it('founder_runtime reads it', async () => {
    expect((await getRegistry('founder')).features).toEqual([
      { key: 'booking.sms.ownNumber', applicationId: 'booking', description: 'own phone' },
    ]);
  });

  it('neither app_runtime (as commercial_rw) nor founder_runtime can write it', async () => {
    for (const url of [process.env.DATABASE_URL!, process.env.DATABASE_URL_FOUNDER!]) {
      const pool = new Pool({ connectionString: url, max: 1 });
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        if (url === process.env.DATABASE_URL) await c.query('SET LOCAL ROLE commercial_rw');
        await expect(
          c.query(
            `UPDATE commercial.quota_key SET refundable = true WHERE key = 'platform.members'`,
          ),
        ).rejects.toThrow(/permission denied/);
        await c.query('ROLLBACK');
      } finally {
        c.release();
        await pool.end();
      }
    }
  });
});
