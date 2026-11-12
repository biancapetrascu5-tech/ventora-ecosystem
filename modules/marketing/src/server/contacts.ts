import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import type { TenantContext } from '@ventora/access';
import { normalizeAddress } from '@ventora/consent';
import { Conflict, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withMarketingTx } from './db';

/*
 * Lot MK.2 — the marketing contacts of a business (D-CK-2 = a): CampaignKit's own register, with an
 * optional link to the ClientDesk contact / the EasyBook client (the id only, never a copy of the
 * source data, as D-CRM-1).
 *
 *   e-mail and phone  normalized here (core/consent normalizeAddress) so the duplicates match
 *                     exactly (D-CRM-8): same e-mail or same phone in the business
 *   archived          instead of deleted (no DELETE, §6.4 c); restored
 *   merged            the duplicate points to the kept contact (merged_into_id); its history stays
 *                     and is shown with the kept one
 *   erased            the GDPR erasure (review #192) through marketing.erase_contact: the personal
 *                     data emptied, no DELETE; an erased contact cannot be changed any more
 *   history           sent / delivered / opened / clicked / unsubscribed / form; append-only,
 *                     written by the campaigns and forms (MK.9+, MK.14) through recordContactEvent
 *
 * The consent is never here: only through core/consent (MK.5). The audit keeps the changed field
 * names, the source and the ids, never the name, the address or the phone.
 */

export const CONTACT_SOURCES = ['import', 'form', 'manual', 'crm', 'booking'] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];
export const CONTACT_EVENT_KINDS = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'unsubscribed',
  'form',
] as const;
export type ContactEventKind = (typeof CONTACT_EVENT_KINDS)[number];
export const CONTACT_LOCALES = ['ro', 'en', 'fr', 'es', 'de', 'it'] as const;

export const CONTACT_LIMITS = {
  name: 160,
  tags: 50,
  tag: 40,
  customFields: 30,
  customKey: 40,
  customValue: 200,
  pageSize: 50,
} as const;

export type CustomFieldValue = string | number | boolean;

export type MarketingContactInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  locale?: string | null;
  tags?: string[];
  customFields?: Record<string, CustomFieldValue>;
  crmContactId?: string | null;
  bookingClientId?: string | null;
};

export type MarketingContact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: string | null;
  tags: string[];
  customFields: Record<string, CustomFieldValue>;
  source: ContactSource;
  crmContactId: string | null;
  bookingClientId: string | null;
  archivedAt: Date | null;
  mergedIntoId: string | null;
  erasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContactEvent = {
  id: string;
  contactId: string;
  kind: ContactEventKind;
  channel: string | null;
  campaignId: string | null;
  occurredAt: Date;
};

export type DuplicatePair = {
  a: MarketingContact;
  b: MarketingContact;
  /** What matched exactly. */
  match: 'email' | 'phone';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOM_KEY = /^[a-z][a-z0-9_]{0,39}$/;

function uuidOrNull(v: string | null | undefined, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (!UUID.test(v)) throw new InvalidInput(field);
  return v.toLowerCase();
}

function assertId(v: string, field = 'contactId'): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new InvalidInput(field);
  return v.toLowerCase();
}

type Normalized = {
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: string | null;
  tags: string[];
  customFields: Record<string, CustomFieldValue>;
  crmContactId: string | null;
  bookingClientId: string | null;
};

/** The contact, checked and normalized; InvalidInput names the first wrong field. */
export function normalizeContact(input: MarketingContactInput): Normalized {
  const name = input.name?.trim() || null;
  if (name !== null && name.length > CONTACT_LIMITS.name) throw new InvalidInput('name');
  let email: string | null = null;
  if (input.email?.trim()) {
    try {
      email = normalizeAddress('email', input.email);
    } catch {
      throw new InvalidInput('email');
    }
  }
  let phone: string | null = null;
  if (input.phone?.trim()) {
    try {
      phone = normalizeAddress('sms', input.phone);
    } catch {
      throw new InvalidInput('phone');
    }
  }
  if (!email && !phone) throw new InvalidInput('email', 'An e-mail or a phone is required');
  const locale = input.locale?.trim().toLowerCase() || null;
  if (locale !== null && !(CONTACT_LOCALES as readonly string[]).includes(locale)) {
    throw new InvalidInput('locale');
  }
  const tags = [...new Set((input.tags ?? []).map((t) => (typeof t === 'string' ? t.trim() : '')))];
  if (tags.length > CONTACT_LIMITS.tags) throw new InvalidInput('tags');
  if (tags.some((t) => !t || t.length > CONTACT_LIMITS.tag)) throw new InvalidInput('tags');
  const customFields: Record<string, CustomFieldValue> = {};
  const entries = Object.entries(input.customFields ?? {});
  if (entries.length > CONTACT_LIMITS.customFields) throw new InvalidInput('customFields');
  for (const [k, v] of entries) {
    if (!CUSTOM_KEY.test(k)) throw new InvalidInput('customFields');
    if (typeof v === 'string') {
      if (v.length > CONTACT_LIMITS.customValue) throw new InvalidInput('customFields');
    } else if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new InvalidInput('customFields');
    } else if (typeof v !== 'boolean') {
      throw new InvalidInput('customFields');
    }
    customFields[k] = v;
  }
  return {
    name,
    email,
    phone,
    locale,
    tags,
    customFields,
    crmContactId: uuidOrNull(input.crmContactId, 'crmContactId'),
    bookingClientId: uuidOrNull(input.bookingClientId, 'bookingClientId'),
  };
}

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: string | null;
  tags: string[];
  custom_fields: Record<string, CustomFieldValue>;
  source: ContactSource;
  crm_contact_id: string | null;
  booking_client_id: string | null;
  archived_at: Date | null;
  merged_into_id: string | null;
  erased_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `id, name, email, phone, locale, tags, custom_fields, source, crm_contact_id,
  booking_client_id, archived_at, merged_into_id, erased_at, created_at, updated_at`;

function fromRow(r: ContactRow): MarketingContact {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    locale: r.locale,
    tags: r.tags,
    customFields: r.custom_fields,
    source: r.source,
    crmContactId: r.crm_contact_id,
    bookingClientId: r.booking_client_id,
    archivedAt: r.archived_at,
    mergedIntoId: r.merged_into_id,
    erasedAt: r.erased_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapUnique(err: unknown): never {
  const e = err as { code?: string; constraint?: string };
  if (e.code === '23505') {
    if (e.constraint === 'contact_crm_contact_key') {
      throw new Conflict('This ClientDesk contact is already linked to a marketing contact');
    }
    if (e.constraint === 'contact_booking_client_key') {
      throw new Conflict('This EasyBook client is already linked to a marketing contact');
    }
  }
  throw err;
}

async function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  contactId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await appendAuditEventInTx(exec, {
    category: 'marketing',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'marketing_contact',
    targetId: contactId,
    metadata,
  });
}

async function lockActive(client: PoolClient, id: string): Promise<ContactRow> {
  const { rows } = await client.query<ContactRow>(
    `SELECT ${COLUMNS} FROM marketing.contact WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = rows[0];
  if (!row || row.merged_into_id) throw new ResourceNotFound('Marketing contact not found');
  if (row.erased_at) throw new Conflict('contact_erased');
  return row;
}

/** Creates a contact (manual, or from an import / a form / an integration later). */
export async function createContactInOrg(
  ctx: TenantContext,
  input: MarketingContactInput,
  source: ContactSource = 'manual',
): Promise<MarketingContact> {
  if (!(CONTACT_SOURCES as readonly string[]).includes(source)) throw new InvalidInput('source');
  const v = normalizeContact(input);
  return withMarketingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client
      .query<ContactRow>(
        `INSERT INTO marketing.contact (organization_id, name, email, phone, locale, tags,
                custom_fields, source, crm_contact_id, booking_client_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         RETURNING ${COLUMNS}`,
        [
          ctx.organizationId,
          v.name,
          v.email,
          v.phone,
          v.locale,
          v.tags,
          JSON.stringify(v.customFields),
          source,
          v.crmContactId,
          v.bookingClientId,
          ctx.userId,
        ],
      )
      .catch(mapUnique);
    const created = fromRow(rows[0]!);
    await audit(exec, ctx, AuditActions.marketingContactCreated, created.id, {
      source,
      linked: { crm: v.crmContactId !== null, booking: v.bookingClientId !== null },
    });
    return created;
  });
}

const EDITABLE: (keyof Normalized)[] = [
  'name',
  'email',
  'phone',
  'locale',
  'tags',
  'customFields',
  'crmContactId',
  'bookingClientId',
];

/** Updates a contact; audits the names of the changed fields only. */
export async function updateContactInOrg(
  ctx: TenantContext,
  contactId: string,
  input: MarketingContactInput,
): Promise<MarketingContact> {
  const id = assertId(contactId);
  const v = normalizeContact(input);
  return withMarketingTx(ctx.organizationId, async (client, exec) => {
    const before = fromRow(await lockActive(client, id));
    const { rows } = await client
      .query<ContactRow>(
        `UPDATE marketing.contact
            SET name = $2, email = $3, phone = $4, locale = $5, tags = $6,
                custom_fields = $7::jsonb, crm_contact_id = $8, booking_client_id = $9
          WHERE id = $1
          RETURNING ${COLUMNS}`,
        [
          id,
          v.name,
          v.email,
          v.phone,
          v.locale,
          v.tags,
          JSON.stringify(v.customFields),
          v.crmContactId,
          v.bookingClientId,
        ],
      )
      .catch(mapUnique);
    const after = fromRow(rows[0]!);
    const changed = EDITABLE.filter(
      (k) => JSON.stringify(before[k as keyof MarketingContact]) !== JSON.stringify(v[k]),
    );
    if (changed.length) {
      await audit(exec, ctx, AuditActions.marketingContactUpdated, id, { changed });
    }
    return after;
  });
}

/** Archives (archived: true) or restores a contact; no DELETE. */
export async function setContactArchivedInOrg(
  ctx: TenantContext,
  contactId: string,
  archived: boolean,
): Promise<{ changed: boolean }> {
  const id = assertId(contactId);
  return withMarketingTx(ctx.organizationId, async (client, exec) => {
    const row = await lockActive(client, id);
    if ((row.archived_at !== null) === archived) return { changed: false };
    await client.query(
      `UPDATE marketing.contact SET archived_at = ${archived ? 'now()' : 'NULL'} WHERE id = $1`,
      [id],
    );
    await audit(
      exec,
      ctx,
      archived ? AuditActions.marketingContactArchived : AuditActions.marketingContactRestored,
      id,
      {},
    );
    return { changed: true };
  });
}

/** One contact (also an archived one); a merged one answers with the contact it went into. */
export async function getContactInOrg(
  ctx: TenantContext,
  contactId: string,
): Promise<MarketingContact> {
  const id = assertId(contactId);
  return withMarketingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<ContactRow>(
        `SELECT ${COLUMNS} FROM marketing.contact
          WHERE id = COALESCE((SELECT merged_into_id FROM marketing.contact WHERE id = $1), $1)`,
        [id],
      );
      if (!rows[0]) throw new ResourceNotFound('Marketing contact not found');
      return fromRow(rows[0]);
    },
    true,
  );
}

export type ContactListQuery = {
  search?: string;
  tag?: string;
  archived?: boolean;
  /** created_at of the last row of the previous page (keyset). */
  before?: string;
};

/** The contacts of the business, newest first, 50 per page; never the merged ones. */
export async function listContactsInOrg(
  ctx: TenantContext,
  query: ContactListQuery = {},
): Promise<{ contacts: MarketingContact[]; nextBefore: string | null }> {
  const search = query.search?.trim().toLowerCase() || null;
  if (search && search.length > 100) throw new InvalidInput('search');
  const tag = query.tag?.trim() || null;
  const before = query.before ? new Date(query.before) : null;
  if (before && Number.isNaN(before.getTime())) throw new InvalidInput('before');
  return withMarketingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<ContactRow>(
        `SELECT ${COLUMNS} FROM marketing.contact
          WHERE merged_into_id IS NULL
            AND (archived_at IS NOT NULL) = $1
            AND ($2::text IS NULL OR lower(coalesce(name, '')) LIKE '%' || $2 || '%'
                 OR coalesce(email, '') LIKE '%' || $2 || '%'
                 OR coalesce(phone, '') LIKE '%' || $2 || '%')
            AND ($3::text IS NULL OR $3 = ANY(tags))
            AND ($4::timestamptz IS NULL OR created_at < $4)
          ORDER BY created_at DESC, id
          LIMIT $5`,
        [query.archived === true, search, tag, before, CONTACT_LIMITS.pageSize + 1],
      );
      const page = rows.slice(0, CONTACT_LIMITS.pageSize).map(fromRow);
      const more = rows.length > CONTACT_LIMITS.pageSize;
      return {
        contacts: page,
        nextBefore: more ? page[page.length - 1]!.createdAt.toISOString() : null,
      };
    },
    true,
  );
}

/** The history of a contact, newest first, with the history of the contacts merged into it. */
export async function getContactHistoryInOrg(
  ctx: TenantContext,
  contactId: string,
): Promise<ContactEvent[]> {
  const id = assertId(contactId);
  return withMarketingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<{
        id: string;
        contact_id: string;
        kind: ContactEventKind;
        channel: string | null;
        campaign_id: string | null;
        occurred_at: Date;
      }>(
        `SELECT e.id, e.contact_id, e.kind, e.channel, e.campaign_id, e.occurred_at
           FROM marketing.contact_event e
          WHERE e.contact_id = $1
             OR e.contact_id IN (SELECT c.id FROM marketing.contact c WHERE c.merged_into_id = $1)
          ORDER BY e.occurred_at DESC, e.id
          LIMIT 200`,
        [id],
      );
      return rows.map((r) => ({
        id: r.id,
        contactId: r.contact_id,
        kind: r.kind,
        channel: r.channel,
        campaignId: r.campaign_id,
        occurredAt: r.occurred_at,
      }));
    },
    true,
  );
}

/**
 * Records an interaction (the campaigns, the forms: MK.9+, MK.14). In the caller's transaction,
 * as marketing_rw in the business; append-only.
 */
export async function recordContactEventInTx(
  client: PoolClient,
  event: {
    contactId: string;
    kind: ContactEventKind;
    channel?: 'email' | 'sms' | 'whatsapp' | null;
    campaignId?: string | null;
    occurredAt?: Date;
  },
): Promise<void> {
  const contactId = assertId(event.contactId);
  if (!(CONTACT_EVENT_KINDS as readonly string[]).includes(event.kind)) {
    throw new InvalidInput('kind');
  }
  await client.query(
    `INSERT INTO marketing.contact_event (organization_id, contact_id, kind, channel, campaign_id,
            occurred_at)
     SELECT c.organization_id, c.id, $2, $3, $4, COALESCE($5, now())
       FROM marketing.contact c WHERE c.id = $1`,
    [
      contactId,
      event.kind,
      event.channel ?? null,
      uuidOrNull(event.campaignId, 'campaignId'),
      event.occurredAt ?? null,
    ],
  );
}

/** The exact duplicates (same e-mail or same phone), without the pairs dismissed. */
export async function listDuplicatesInOrg(ctx: TenantContext): Promise<DuplicatePair[]> {
  return withMarketingTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<{ a: string; b: string; match: 'email' | 'phone' }>(
        `SELECT DISTINCT ON (LEAST(x.id, y.id), GREATEST(x.id, y.id))
                LEAST(x.id, y.id) AS a, GREATEST(x.id, y.id) AS b,
                CASE WHEN x.email IS NOT NULL AND x.email = y.email THEN 'email' ELSE 'phone' END
                  AS match
           FROM marketing.contact x
           JOIN marketing.contact y
             ON x.id < y.id
            AND ((x.email IS NOT NULL AND x.email = y.email)
                 OR (x.phone IS NOT NULL AND x.phone = y.phone))
          WHERE x.merged_into_id IS NULL AND y.merged_into_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM marketing.duplicate_dismissal d
                             WHERE d.contact_a_id = LEAST(x.id, y.id)
                               AND d.contact_b_id = GREATEST(x.id, y.id))
          ORDER BY LEAST(x.id, y.id), GREATEST(x.id, y.id)
          LIMIT 100`,
      );
      if (!rows.length) return [];
      const ids = [...new Set(rows.flatMap((r) => [r.a, r.b]))];
      const contacts = await client.query<ContactRow>(
        `SELECT ${COLUMNS} FROM marketing.contact WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      const byId = new Map(contacts.rows.map((r) => [r.id, fromRow(r)]));
      return rows.map((r) => ({ a: byId.get(r.a)!, b: byId.get(r.b)!, match: r.match }));
    },
    true,
  );
}

/** „Nu sunt duplicate”: the pair is not proposed again. */
export async function dismissDuplicateInOrg(
  ctx: TenantContext,
  contactId: string,
  otherId: string,
): Promise<void> {
  const x = assertId(contactId);
  const y = assertId(otherId, 'otherId');
  if (x === y) throw new InvalidInput('otherId');
  const [a, b] = x < y ? [x, y] : [y, x];
  await withMarketingTx(ctx.organizationId, async (client, exec) => {
    await lockActive(client, a);
    await lockActive(client, b);
    const { rowCount } = await client.query(
      `INSERT INTO marketing.duplicate_dismissal (organization_id, contact_a_id, contact_b_id,
              dismissed_by_user_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [ctx.organizationId, a, b, ctx.userId],
    );
    if (rowCount) {
      await audit(exec, ctx, AuditActions.marketingDuplicateDismissed, a, { otherId: b });
    }
  });
}

/**
 * Merges `duplicateId` into `keepId`: the kept contact takes what it lacks (name, e-mail, phone,
 * locale, the ClientDesk / EasyBook links), the union of the tags and the custom fields (its own
 * win); the duplicate points to it and its history is shown with the kept one.
 */
export async function mergeContactsInOrg(
  ctx: TenantContext,
  keepId: string,
  duplicateId: string,
): Promise<MarketingContact> {
  const keep = assertId(keepId, 'keepId');
  const dup = assertId(duplicateId, 'duplicateId');
  if (keep === dup) throw new InvalidInput('duplicateId');
  return withMarketingTx(ctx.organizationId, async (client, exec) => {
    const [first, second] = keep < dup ? [keep, dup] : [dup, keep];
    const lockedFirst = await lockActive(client, first);
    const lockedSecond = await lockActive(client, second);
    const k = fromRow(first === keep ? lockedFirst : lockedSecond);
    const d = fromRow(first === keep ? lockedSecond : lockedFirst);
    // the duplicate leaves the unique links first, so the kept one can take them
    await client.query(
      `UPDATE marketing.contact SET merged_into_id = $2, crm_contact_id = NULL,
              booking_client_id = NULL WHERE id = $1`,
      [d.id, k.id],
    );
    const { rows } = await client
      .query<ContactRow>(
        `UPDATE marketing.contact
            SET name = $2, email = $3, phone = $4, locale = $5, tags = $6,
                custom_fields = $7::jsonb, crm_contact_id = $8, booking_client_id = $9,
                archived_at = CASE WHEN archived_at IS NOT NULL AND $10 THEN NULL ELSE archived_at END
          WHERE id = $1
          RETURNING ${COLUMNS}`,
        [
          k.id,
          k.name ?? d.name,
          k.email ?? d.email,
          k.phone ?? d.phone,
          k.locale ?? d.locale,
          [...new Set([...k.tags, ...d.tags])].slice(0, CONTACT_LIMITS.tags),
          JSON.stringify({ ...d.customFields, ...k.customFields }),
          k.crmContactId ?? d.crmContactId,
          k.bookingClientId ?? d.bookingClientId,
          d.archivedAt === null,
        ],
      )
      .catch(mapUnique);
    await audit(exec, ctx, AuditActions.marketingContactMerged, k.id, { mergedId: d.id });
    return fromRow(rows[0]!);
  });
}

/**
 * The GDPR erasure (review #192), through marketing.erase_contact: the contact and the contacts
 * merged into it lose their personal data (name, e-mail, phone, tags, custom fields, locale, the
 * links) and are marked erased; no DELETE. The history (kinds and dates only) stays; the
 * suppression list of core/consent (only the hash) stays, so the person stays unsubscribed.
 * Twice: nothing more.
 */
export async function eraseContactInOrg(
  ctx: TenantContext,
  contactId: string,
): Promise<{ erased: number }> {
  const id = assertId(contactId);
  return withMarketingTx(ctx.organizationId, async (client, exec) => {
    const { rows } = await client.query<ContactRow>(
      `SELECT ${COLUMNS} FROM marketing.contact WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new ResourceNotFound('Marketing contact not found');
    if (row.merged_into_id) throw new Conflict('contact_merged');
    if (row.erased_at) return { erased: 0 };
    const n = (
      await client.query<{ n: number }>(`SELECT marketing.erase_contact($1, $2) AS n`, [
        id,
        ctx.userId,
      ])
    ).rows[0]!.n;
    await audit(exec, ctx, AuditActions.marketingContactErased, id, { contacts: n });
    return { erased: n };
  });
}
