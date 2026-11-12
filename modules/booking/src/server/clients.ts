import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { BookingClientErasedV1, BookingClientMergedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { behaviorNoteOf, type BehaviorNote } from './behavior';
import { deleteMarkedPhotos } from './forms';
import { withBookingTx } from './db';
import { isUuid } from './validation';
import { hubOnly } from './actor';

/*
 * Lot B.7a — the client card (BOOKING.md §3 B.7; plan reports/2026-11-10_1745_plan-booking-b7.md,
 * approved 10.11.2026; designs BookingClientCard, BookingBlockedClients S125, BookingClientMerge
 * S139). Every write runs in one transaction as booking_rw, with its audit row (C.0f codes) and, for
 * ClientDesk (D-CRM-9), its outbox event — only ids, never the client's data, a block or a note.
 *
 *   the card          → the client, the statistics of the last 12 months, the last appointments
 *                       (with those of the clients merged into it), the open block (its reason only
 *                       for the owner, the admins and the application manager)
 *   blocks (S125)     → booking:admin (D-B7-3 = a); the reason stays after unblocking (the log)
 *   the merge (S139)  → D-B7-2 = a: the duplicate is archived with a link; its appointments keep their
 *                       client_id and show on the kept card („Din fișa …”); a blocked client stays
 *                       blocked; „Completează câmpurile goale” fills only the kept client's empty fields
 *   the erasure       → D-B7-1 = a: booking.erase_client (SECURITY DEFINER), the only way to change
 *                       the copies of the name on the appointments
 */

const OCCUPYING = ['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress'];

export const CLIENT_CARD_LIMITS = {
  reasonMin: 10,
  reasonMax: 500,
  recentAppointments: 5,
  listMax: 100,
} as const;

export type ClientBlock = {
  blockedAt: Date;
  blockedByUserId: string;
  /** Only for the owner, the admins and the application manager (S125); null for the others. */
  reason: string | null;
};

export type ClientCardAppointment = {
  id: string;
  number: number;
  startsAt: Date;
  status: string;
  serviceName: string;
  staffDisplayName: string;
  priceMinor: number;
  currency: string;
  /** S139: an appointment of a client merged into this one („Din fișa „Cristina D.””). */
  fromClientId: string | null;
};

export type ClientCard = {
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    locale: string;
    archivedAt: Date | null;
    mergedIntoClientId: string | null;
    erasedAt: Date | null;
    createdAt: Date;
  };
  /** The last 12 months, with the clients merged into this one. */
  stats: { visits: number; noShows: number; lateCancellations: number; upcoming: number };
  recent: ClientCardAppointment[];
  block: ClientBlock | null;
  /**
   * B.7b (S139) „Risc ridicat”, only for the owner, the admins and the application manager (null for
   * the others, and when the note is off or the client has no label).
   */
  behaviorNote: BehaviorNote | null;
  /** The clients merged into this one (archived, with a link). */
  mergedClientIds: string[];
};

export type BlockedClient = {
  clientId: string;
  name: string;
  phone: string | null;
  blockedAt: Date;
  blockedByUserId: string;
  reason: string | null;
};

function requireId(id: unknown): string {
  if (!isUuid(id)) throw new ResourceNotFound();
  return id;
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'booking',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'booking_client',
    targetId,
    metadata,
  });
}

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  locale: string;
  archived_at: Date | null;
  merged_into_client_id: string | null;
  erased_at: Date | null;
  created_at: Date;
};

const CLIENT_COLUMNS = `id, name, phone, email, locale, archived_at, merged_into_client_id,
  erased_at, created_at`;

async function readClient(client: PoolClient, id: string, lock = false): Promise<ClientRow> {
  const { rows } = await client.query<ClientRow>(
    `SELECT ${CLIENT_COLUMNS} FROM booking.client WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

/** The client and the clients merged into it (their appointments show on its card). */
async function familyOf(client: PoolClient, id: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM booking.client WHERE id = $1 OR merged_into_client_id = $1`,
    [id],
  );
  return rows.map((r) => r.id);
}

// ── reading ─────────────────────────────────────────────────────────────────────────────────

/** BookingClientCard. `seesReasons`: owner, admin, application manager (S125). */
export async function getClientCardInOrg(
  ctx: TenantContext,
  clientId: unknown,
  seesReasons: boolean,
): Promise<ClientCard> {
  hubOnly(ctx);
  const id = requireId(clientId);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const row = await readClient(client, id);
      const family = await familyOf(client, id);
      const stats = (
        await client.query<{ visits: string; no_shows: string; late: string; upcoming: string }>(
          `SELECT count(*) FILTER (WHERE status = 'completed' AND starts_at >= now() - interval '12 months') AS visits,
                  count(*) FILTER (WHERE status = 'no_show' AND starts_at >= now() - interval '12 months') AS no_shows,
                  count(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'client' AND cancel_late
                                     AND starts_at >= now() - interval '12 months') AS late,
                  count(*) FILTER (WHERE status = ANY($2::text[]) AND starts_at >= now()) AS upcoming
             FROM booking.appointment WHERE client_id = ANY($1::uuid[])`,
          [family, OCCUPYING],
        )
      ).rows[0]!;
      const recent = await appointmentsOf(
        client,
        id,
        family,
        CLIENT_CARD_LIMITS.recentAppointments,
        0,
      );
      const block = (
        await client.query<{ blocked_at: Date; blocked_by_user_id: string; reason: string }>(
          `SELECT blocked_at, blocked_by_user_id, reason FROM booking.client_block
            WHERE client_id = $1 AND unblocked_at IS NULL`,
          [id],
        )
      ).rows[0];
      return {
        client: {
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          locale: row.locale,
          archivedAt: row.archived_at,
          mergedIntoClientId: row.merged_into_client_id,
          erasedAt: row.erased_at,
          createdAt: row.created_at,
        },
        stats: {
          visits: Number(stats.visits),
          noShows: Number(stats.no_shows),
          lateCancellations: Number(stats.late),
          upcoming: Number(stats.upcoming),
        },
        recent,
        block: block
          ? {
              blockedAt: block.blocked_at,
              blockedByUserId: block.blocked_by_user_id,
              reason: seesReasons ? block.reason : null,
            }
          : null,
        behaviorNote: seesReasons ? await behaviorNoteOf(client, id) : null,
        mergedClientIds: family.filter((f) => f !== id),
      };
    },
    true,
  );
}

async function appointmentsOf(
  client: PoolClient,
  id: string,
  family: string[],
  limit: number,
  offset: number,
): Promise<ClientCardAppointment[]> {
  const { rows } = await client.query<{
    id: string;
    number: number;
    starts_at: Date;
    status: string;
    service_name: string;
    staff_display_name: string;
    price_minor: number;
    currency: string;
    client_id: string;
  }>(
    `SELECT id, number, starts_at, status, service_name, staff_display_name, price_minor, currency,
            client_id
       FROM booking.appointment WHERE client_id = ANY($1::uuid[])
      ORDER BY starts_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [family, limit, offset],
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    startsAt: r.starts_at,
    status: r.status,
    serviceName: r.service_name,
    staffDisplayName: r.staff_display_name,
    priceMinor: r.price_minor,
    currency: r.currency.trim(),
    fromClientId: r.client_id === id ? null : r.client_id,
  }));
}

/** ClientDesk (D-CRM-9) and the card: the client's appointments, the merged ones included. */
export async function listClientAppointmentsInOrg(
  ctx: TenantContext,
  params: { clientId: unknown; limit?: unknown; offset?: unknown },
): Promise<{ items: ClientCardAppointment[]; total: number }> {
  hubOnly(ctx);
  const id = requireId(params.clientId);
  const limit = params.limit === undefined ? 50 : params.limit;
  const offset = params.offset === undefined ? 0 : params.offset;
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > CLIENT_CARD_LIMITS.listMax
  ) {
    throw new InvalidInput('limit', 'invalid');
  }
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new InvalidInput('offset', 'invalid');
  }
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      await readClient(client, id);
      const family = await familyOf(client, id);
      const total = Number(
        (
          await client.query<{ n: string }>(
            `SELECT count(*) AS n FROM booking.appointment WHERE client_id = ANY($1::uuid[])`,
            [family],
          )
        ).rows[0]!.n,
      );
      return { items: await appointmentsOf(client, id, family, limit, offset), total };
    },
    true,
  );
}

/** BookingBlockedClients: „Blocați · n”, the most recent first. */
export async function listBlockedClientsInOrg(
  ctx: TenantContext,
  seesReasons: boolean,
): Promise<BlockedClient[]> {
  hubOnly(ctx);
  return withBookingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<{
        client_id: string;
        name: string;
        phone: string | null;
        blocked_at: Date;
        blocked_by_user_id: string;
        reason: string;
      }>(
        `SELECT b.client_id, c.name, c.phone, b.blocked_at, b.blocked_by_user_id, b.reason
           FROM booking.client_block b JOIN booking.client c ON c.id = b.client_id
          WHERE b.unblocked_at IS NULL
          ORDER BY b.blocked_at DESC, b.id DESC`,
      );
      return rows.map((r) => ({
        clientId: r.client_id,
        name: r.name,
        phone: r.phone,
        blockedAt: r.blocked_at,
        blockedByUserId: r.blocked_by_user_id,
        reason: seesReasons ? r.reason : null,
      }));
    },
    true,
  );
}

/** Is the client blocked now? (B.11 refuses online, without telling why; D-B7-4 = a.) */
export async function isClientBlocked(client: PoolClient, clientId: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM booking.client_block WHERE client_id = $1 AND unblocked_at IS NULL`,
    [clientId],
  );
  return rows.length > 0;
}

// ── writing (booking:admin) ─────────────────────────────────────────────────────────────────

function requireReason(value: unknown): string {
  if (typeof value !== 'string') throw new InvalidInput('reason', 'invalid');
  const reason = value.trim();
  if (reason.length < CLIENT_CARD_LIMITS.reasonMin) throw new InvalidInput('reason', 'too_short');
  if (reason.length > CLIENT_CARD_LIMITS.reasonMax) throw new InvalidInput('reason', 'too_long');
  return reason;
}

/** „Blochează clientul…” (S125). A block already open → Conflict('client_blocked'). */
export async function blockClientInOrg(
  ctx: TenantContext,
  params: { clientId: unknown; reason: unknown },
): Promise<void> {
  hubOnly(ctx);
  const id = requireId(params.clientId);
  const reason = requireReason(params.reason);
  await withBookingTx(ctx.organizationId, async (client, exec) => {
    const row = await readClient(client, id, true);
    if (row.erased_at) throw new Conflict('client_erased');
    if (row.merged_into_client_id) throw new Conflict('client_merged');
    if (await isClientBlocked(client, id)) throw new Conflict('client_blocked');
    await client.query(
      `INSERT INTO booking.client_block (id, organization_id, client_id, reason, blocked_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv7(), ctx.organizationId, id, reason, ctx.userId],
    );
    // the reason is personal: only its length in the log, the text stays in client_block
    await audit(exec, ctx, AuditActions.bookingClientBlocked, id, { reasonLength: reason.length });
  });
}

/** „Deblochează”: the block is closed; its reason stays (the business log, S125). */
export async function unblockClientInOrg(ctx: TenantContext, clientId: unknown): Promise<void> {
  hubOnly(ctx);
  const id = requireId(clientId);
  await withBookingTx(ctx.organizationId, async (client, exec) => {
    await readClient(client, id, true);
    const { rowCount } = await client.query(
      `UPDATE booking.client_block SET unblocked_at = now(), unblocked_by_user_id = $2
        WHERE client_id = $1 AND unblocked_at IS NULL`,
      [id, ctx.userId],
    );
    if (rowCount) await audit(exec, ctx, AuditActions.bookingClientUnblocked, id, {});
  });
}

/**
 * „Îmbină cu alt client” (S139, D-B7-2 = a). The duplicate is archived with a link to the one kept;
 * the clients already merged into it now point to the kept one; its appointments keep their
 * client_id and show on the kept card. A blocked duplicate keeps the kept client blocked (its block
 * is closed and reopened on the kept one, with the same reason). `fillEmpty`: the kept client takes
 * the duplicate's phone, e-mail when its own are empty.
 */
export async function mergeClientsInOrg(
  ctx: TenantContext,
  params: { keepClientId: unknown; mergeClientId: unknown; fillEmpty?: unknown },
): Promise<{ keptClientId: string; mergedClientId: string }> {
  hubOnly(ctx);
  const keepId = requireId(params.keepClientId);
  const mergeId = requireId(params.mergeClientId);
  if (keepId === mergeId) throw new InvalidInput('mergeClientId', 'invalid');
  if (params.fillEmpty !== undefined && typeof params.fillEmpty !== 'boolean') {
    throw new InvalidInput('fillEmpty', 'invalid');
  }
  return withBookingTx(ctx.organizationId, async (client, exec) => {
    // both locked, in id order (two merges of the same pair wait for each other)
    const [first, second] = keepId < mergeId ? [keepId, mergeId] : [mergeId, keepId];
    const a = await readClient(client, first, true);
    const b = await readClient(client, second, true);
    const keep = a.id === keepId ? a : b;
    const dup = a.id === keepId ? b : a;
    for (const c of [keep, dup]) {
      if (c.erased_at) throw new Conflict('client_erased');
      if (c.merged_into_client_id) throw new Conflict('client_merged');
      if (c.archived_at) throw new Conflict('client_archived');
    }

    // S139: a blocked client stays blocked
    const dupBlock = (
      await client.query<{ id: string; reason: string }>(
        `SELECT id, reason FROM booking.client_block WHERE client_id = $1 AND unblocked_at IS NULL`,
        [dup.id],
      )
    ).rows[0];
    if (dupBlock) {
      await client.query(
        `UPDATE booking.client_block SET unblocked_at = now(), unblocked_by_user_id = $2 WHERE id = $1`,
        [dupBlock.id, ctx.userId],
      );
      if (!(await isClientBlocked(client, keep.id))) {
        await client.query(
          `INSERT INTO booking.client_block (id, organization_id, client_id, reason, blocked_by_user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv7(), ctx.organizationId, keep.id, dupBlock.reason, ctx.userId],
        );
      }
    }

    // the duplicate leaves the search first (its phone / e-mail free the unique indexes)
    await client.query(
      `UPDATE booking.client
          SET archived_at = now(), archived_by_user_id = $2,
              merged_into_client_id = $3, merged_at = now(), merged_by_user_id = $2
        WHERE id = $1`,
      [dup.id, ctx.userId, keep.id],
    );
    await client.query(
      `UPDATE booking.client SET merged_into_client_id = $1 WHERE merged_into_client_id = $2`,
      [keep.id, dup.id],
    );
    const filled: string[] = [];
    if (params.fillEmpty === true) {
      const phone = keep.phone ?? dup.phone;
      const email = keep.email ?? dup.email;
      if (phone !== keep.phone) filled.push('phone');
      if (email !== keep.email) filled.push('email');
      if (filled.length) {
        await client.query(`UPDATE booking.client SET phone = $2, email = $3 WHERE id = $1`, [
          keep.id,
          phone,
          email,
        ]);
      }
    }
    await audit(exec, ctx, AuditActions.bookingClientMerged, keep.id, {
      mergedClientId: dup.id,
      ...(filled.length ? { filled } : {}),
      ...(dupBlock ? { blockKept: true } : {}),
    });
    await writeOutboxEvent(client, 'booking', BookingClientMergedV1, {
      organizationId: ctx.organizationId,
      sourceApp: 'platform',
      resourceId: keep.id,
      payload: {
        keptClientId: keep.id,
        mergedClientId: dup.id,
        mergedAt: new Date().toISOString(),
      },
    });
    return { keptClientId: keep.id, mergedClientId: dup.id };
  });
}

/**
 * The GDPR erasure of a client (ARCHITECTURE §6.4 e, D-B7-1 = a), through booking.erase_client:
 * the client and the clients merged into it, the copies of the name and the team's notes on their
 * appointments, the reasons of their blocks. The appointments stay. Twice: nothing more.
 */
export async function eraseClientInOrg(
  ctx: TenantContext,
  clientId: unknown,
): Promise<{ appointmentsAnonymized: number; photosPending: number }> {
  hubOnly(ctx);
  const id = requireId(clientId);
  const erased = await withBookingTx(ctx.organizationId, async (client, exec) => {
    const row = await readClient(client, id);
    if (row.merged_into_client_id) throw new Conflict('client_merged');
    if (row.erased_at) return { appointmentsAnonymized: 0 };
    const n = (
      await client.query<{ n: number }>(`SELECT booking.erase_client($1, $2) AS n`, [
        id,
        ctx.userId,
      ])
    ).rows[0]!.n;
    await audit(exec, ctx, AuditActions.bookingClientErased, id, { appointments: n });
    await writeOutboxEvent(client, 'booking', BookingClientErasedV1, {
      organizationId: ctx.organizationId,
      sourceApp: 'platform',
      resourceId: id,
      payload: { clientId: id, erasedAt: new Date().toISOString() },
    });
    return { appointmentsAnonymized: n };
  });
  // B.12 (S127): the photos marked by erase_client, deleted by the system deletion of core/files
  // (C.4f); the ones the storage refuses stay marked and the cleanup job retries them
  const photos = await deleteMarkedPhotos(ctx.organizationId, id);
  return { ...erased, photosPending: photos.pending };
}
