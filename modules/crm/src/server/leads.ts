import type { PoolClient } from 'pg';
import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withCrmTx } from './db';
import { createContactInOrg, type Contact, type ContactScope } from './contacts';
import { createDealInOrg } from './deals';
import { readSubject, requireMentionable } from './subjects';
import { scoreLead, scoreSql, type LeadScore } from './scoring';
import {
  LIMITS,
  isUuid,
  optionalBoolean,
  likePattern,
  normalizeEmail,
  normalizePhone,
  optionalText,
  page,
  requireId,
  requiredText,
  type ContactSource,
} from './validation';

/*
 * Lot CR.8 — the leads of ClientDesk (D-CRM-3; design S131 ClientDeskLeads): requests that are not
 * clients yet, apart from the contacts — they take no unit of crm.contacts until converted.
 *
 * - Who sees a lead: as a contact (D-CRM-15) — crm:admin all; a member their own and the
 *   unassigned ones („Ia leadul”). Writing needs crm:write.
 * - The states: new → contacted → qualified (any order among them); closed as disqualified (a
 *   reason from the S131 list, a note; „Redeschide leadul” brings it back to new) or converted.
 * - „Convertește”: a new contact (one unit of crm.contacts; the lead's source becomes the
 *   contact's when it is one of the contact sources, otherwise manual) or „Leagă leadul de
 *   contactul existent” (S131, the default when a duplicate exists). The lead is closed in the same
 *   transaction as the new contact; it stays linked, its notes, tasks and files show in the
 *   contact's history. CR.9: „Creează și un deal” right after, with the budget as its value.
 * - Leads with no activity for N days: `idleDays` on the list (the last note or activity, or the
 *   arrival).
 * - Sources: the fixed S131 set; configurable sources are NECESITĂ DECIZIE. The score and the
 *   automatic deletion of old disqualified leads are DE DECIS (S131).
 * - The events crm.lead.created / converted / disqualified need their types in packages/contracts
 *   (a separate PR, proposal); the audit is here (ids, source, state, never the request's text).
 */

export const LEAD_SOURCES = ['form', 'phone', 'email', 'referral', 'event', 'manual'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
/** What a person picks when adding a lead by hand: `form` is written by the forms (CR.17). */
export const MANUAL_LEAD_SOURCES: readonly LeadSource[] = [
  'phone',
  'email',
  'referral',
  'event',
  'manual',
];
export const LEAD_STATES = ['new', 'contacted', 'qualified', 'disqualified', 'converted'] as const;
export type LeadState = (typeof LEAD_STATES)[number];
export const OPEN_STATES: readonly LeadState[] = ['new', 'contacted', 'qualified'];
export const DISQUALIFY_REASONS = [
  'budget',
  'no_reply',
  'not_offered',
  'competitor',
  'spam',
  'other',
] as const;
export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number];
export const LEAD_LIMITS = { request: 5000, disqualifyNote: 500, idleDaysMax: 365 } as const;

const CONTACT_SOURCE: Record<LeadSource, ContactSource> = {
  form: 'form',
  referral: 'referral',
  event: 'event',
  phone: 'manual',
  email: 'manual',
  manual: 'manual',
};

export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  request: string | null;
  source: LeadSource;
  referredBy: string | null;
  budgetMinor: number | null;
  currency: string;
  /** YYYY-MM-DD */
  eventDate: string | null;
  ownerUserId: string | null;
  state: LeadState;
  disqualifyReason: DisqualifyReason | null;
  disqualifyNote: string | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  convertedContactId: string | null;
  /** CR.10: „a cerut prețul” (+15). */
  askedPrice: boolean;
  /** CR.10: „a deschis oferta” (+20), set by the e-mail tracking (CR.14). */
  offerOpenedAt: Date | null;
  /** CR.10: the score and its reasons; null when the business switched scoring off. */
  score: LeadScore | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  request: string | null;
  source: LeadSource;
  referred_by: string | null;
  budget_minor: string | null;
  currency: string;
  event_date: string | null;
  owner_user_id: string | null;
  state: LeadState;
  disqualify_reason: DisqualifyReason | null;
  disqualify_note: string | null;
  closed_at: Date | null;
  closed_by_user_id: string | null;
  converted_contact_id: string | null;
  asked_price: boolean;
  offer_opened_at: Date | null;
  scoring_enabled: boolean;
  min_budget: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `l.id, l.name, l.phone, l.email, l.request, l.source, l.referred_by, l.budget_minor,
  l.currency, to_char(l.event_date, 'YYYY-MM-DD') AS event_date, l.owner_user_id, l.state,
  l.disqualify_reason, l.disqualify_note, l.closed_at, l.closed_by_user_id, l.converted_contact_id,
  l.asked_price, l.offer_opened_at,
  COALESCE((SELECT s.lead_scoring_enabled FROM crm.settings s), true) AS scoring_enabled,
  (SELECT s.lead_min_budget_minor FROM crm.settings s) AS min_budget,
  l.deleted_at, l.created_at, l.updated_at`;

function toLead(r: LeadRow): Lead {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    request: r.request,
    source: r.source,
    referredBy: r.referred_by,
    budgetMinor: r.budget_minor === null ? null : Number(r.budget_minor),
    currency: r.currency,
    eventDate: r.event_date,
    ownerUserId: r.owner_user_id,
    state: r.state,
    disqualifyReason: r.disqualify_reason,
    disqualifyNote: r.disqualify_note,
    closedAt: r.closed_at,
    closedByUserId: r.closed_by_user_id,
    convertedContactId: r.converted_contact_id,
    askedPrice: r.asked_price,
    offerOpenedAt: r.offer_opened_at,
    score: scoreLead(
      {
        offerOpenedAt: r.offer_opened_at,
        source: r.source,
        askedPrice: r.asked_price,
        budgetMinor: r.budget_minor === null ? null : Number(r.budget_minor),
        eventDate: r.event_date,
        phone: r.phone,
      },
      {
        enabled: r.scoring_enabled,
        minBudgetMinor: r.min_budget === null ? null : Number(r.min_budget),
      },
    ),
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── validation ─────────────────────────────────────────────────────────────────────────────────

function oneOf<T extends string>(field: string, allowed: readonly T[], value: unknown): T {
  if ((allowed as readonly unknown[]).includes(value)) return value as T;
  throw new InvalidInput(field, 'invalid');
}

function multiline(field: string, value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput(field, 'invalid');
  const v = value.replace(/\r\n?/g, '\n').trim();
  if (v === '') return null;
  if (v.length > max) throw new InvalidInput(field, 'too_long');
  return v;
}

function normalizeBudget(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new InvalidInput('budgetMinor', 'invalid');
  }
  return value as number;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeDay(field: string, value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const m = typeof value === 'string' ? DAY_RE.exec(value) : null;
  if (!m) throw new InvalidInput(field, 'invalid');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new InvalidInput(field, 'invalid');
  }
  return value as string;
}

export type LeadInput = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  request?: unknown;
  source?: unknown;
  referredBy?: unknown;
  budgetMinor?: unknown;
  eventDate?: unknown;
  /** CR.10: „a cerut prețul”. */
  askedPrice?: unknown;
};

function details(input: LeadInput) {
  return {
    phone: normalizePhone('phone', input.phone),
    email: normalizeEmail('email', input.email),
    request: multiline('request', input.request, LEAD_LIMITS.request),
    referredBy: optionalText('referredBy', input.referredBy, LIMITS.name),
    budgetMinor: normalizeBudget(input.budgetMinor),
    eventDate: normalizeDay('eventDate', input.eventDate),
    askedPrice: optionalBoolean('askedPrice', input.askedPrice),
  };
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  leadId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'crm',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'crm_lead',
    targetId: leadId,
    metadata,
  });
}

async function readLead(client: PoolClient, id: string, lock = false): Promise<LeadRow> {
  const { rows } = await client.query<LeadRow>(
    `SELECT ${COLUMNS} FROM crm.lead l WHERE l.id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

function visible(ctx: TenantContext, scope: ContactScope, row: { owner_user_id: string | null }) {
  return scope === 'all' || row.owner_user_id === null || row.owner_user_id === ctx.userId;
}

/** A visible lead, locked, not in the bin. */
async function writableLead(
  client: PoolClient,
  ctx: TenantContext,
  scope: ContactScope,
  id: string,
): Promise<LeadRow> {
  const row = await readLead(client, id, true);
  if (!visible(ctx, scope, row)) throw new Forbidden();
  if (row.deleted_at) throw new Conflict('lead_deleted');
  return row;
}

/** With crm:admin any member with access to ClientDesk; a member only themselves or nobody. */
async function ownerFor(
  ctx: TenantContext,
  scope: ContactScope,
  value: unknown,
): Promise<string | null> {
  if (value === null) return null;
  const owner = requireId('ownerUserId', value);
  if (scope === 'own' && owner !== ctx.userId) throw new Forbidden();
  if (owner !== ctx.userId) await requireMentionable(ctx, null, [owner], 'ownerUserId');
  return owner;
}

// ── write ──────────────────────────────────────────────────────────────────────────────────────

/** „Lead nou” (a person: not `form`). */
export async function createLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: LeadInput & { ownerUserId?: unknown },
): Promise<Lead> {
  const name = requiredText('name', input.name, LIMITS.name);
  const d = details(input);
  const source =
    input.source === undefined ? 'manual' : oneOf('source', MANUAL_LEAD_SOURCES, input.source);
  const owner =
    input.ownerUserId === undefined ? ctx.userId : await ownerFor(ctx, scope, input.ownerUserId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const id = uuidv7();
    const { rows } = await client.query<LeadRow>(
      `INSERT INTO crm.lead AS l
         (id, organization_id, name, phone, email, request, source, referred_by, budget_minor,
          event_date, owner_user_id, created_by_user_id, asked_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13)
       RETURNING ${COLUMNS}`,
      [
        id,
        ctx.organizationId,
        name,
        d.phone ?? null,
        d.email ?? null,
        d.request ?? null,
        source,
        d.referredBy ?? null,
        d.budgetMinor ?? null,
        d.eventDate ?? null,
        owner,
        ctx.userId,
        d.askedPrice ?? false,
      ],
    );
    await audit(exec, ctx, AuditActions.crmLeadCreated, id, { source, ownerUserId: owner });
    return toLead(rows[0]!);
  });
}

const DETAIL_COLUMNS = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  request: 'request',
  source: 'source',
  referredBy: 'referred_by',
  budgetMinor: 'budget_minor',
  eventDate: 'event_date',
  askedPrice: 'asked_price',
} as const;

/** The details of the lead; only the fields sent. A converted lead is closed: no change. */
export async function updateLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
  input: LeadInput,
): Promise<Lead> {
  const id = requireId('leadId', leadId);
  const d = details(input);
  const values: Partial<Record<keyof typeof DETAIL_COLUMNS, unknown>> = {
    ...d,
    name: input.name === undefined ? undefined : requiredText('name', input.name, LIMITS.name),
    source: input.source === undefined ? undefined : oneOf('source', LEAD_SOURCES, input.source),
  };
  const fields = (Object.keys(DETAIL_COLUMNS) as (keyof typeof DETAIL_COLUMNS)[]).filter(
    (k) => values[k] !== undefined,
  );
  if (!fields.length) throw new InvalidInput('name', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableLead(client, ctx, scope, id);
    if (row.state === 'converted') throw new Conflict('lead_converted');
    // `form` stays the forms' (CR.17): a person keeps it or picks a manual source
    if (values.source === 'form' && row.source !== 'form') {
      throw new InvalidInput('source', 'invalid');
    }
    const sets = fields.map(
      (k, i) => `${DETAIL_COLUMNS[k]} = $${i + 2}${k === 'eventDate' ? '::date' : ''}`,
    );
    const { rows } = await client.query<LeadRow>(
      `UPDATE crm.lead l SET ${sets.join(', ')} WHERE l.id = $1 RETURNING ${COLUMNS}`,
      [id, ...fields.map((k) => values[k])],
    );
    await audit(exec, ctx, AuditActions.crmLeadUpdated, id, {
      fields: fields.map((k) => DETAIL_COLUMNS[k]),
    });
    return toLead(rows[0]!);
  });
}

/** „Responsabil” / „Ia leadul”. */
export async function assignLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
  ownerUserId: unknown,
): Promise<Lead> {
  const id = requireId('leadId', leadId);
  const owner = await ownerFor(ctx, scope, ownerUserId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableLead(client, ctx, scope, id);
    if (row.owner_user_id === owner) return toLead(row);
    const { rows } = await client.query<LeadRow>(
      `UPDATE crm.lead l SET owner_user_id = $2 WHERE l.id = $1 RETURNING ${COLUMNS}`,
      [id, owner],
    );
    await audit(exec, ctx, AuditActions.crmLeadAssigned, id, {
      fromUserId: row.owner_user_id,
      ownerUserId: owner,
    });
    return toLead(rows[0]!);
  });
}

/** „Contactat” / „Calificat” / back to „Nou”: only while the lead is open. */
export async function setLeadStateInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
  state: unknown,
): Promise<Lead> {
  const id = requireId('leadId', leadId);
  const next = oneOf('state', OPEN_STATES, state);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableLead(client, ctx, scope, id);
    if (!OPEN_STATES.includes(row.state)) throw new Conflict('lead_closed');
    if (row.state === next) return toLead(row);
    const { rows } = await client.query<LeadRow>(
      `UPDATE crm.lead l SET state = $2 WHERE l.id = $1 RETURNING ${COLUMNS}`,
      [id, next],
    );
    await audit(exec, ctx, AuditActions.crmLeadUpdated, id, {
      fields: ['state'],
      from: row.state,
      state: next,
    });
    return toLead(rows[0]!);
  });
}

/** „Descalifică”: a reason (S131), an optional note; the lead goes to „Închise”. */
export async function disqualifyLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
  input: { reason?: unknown; note?: unknown },
): Promise<Lead> {
  const id = requireId('leadId', leadId);
  const reason = oneOf('reason', DISQUALIFY_REASONS, input.reason);
  const note = multiline('note', input.note, LEAD_LIMITS.disqualifyNote) ?? null;
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableLead(client, ctx, scope, id);
    if (!OPEN_STATES.includes(row.state)) throw new Conflict('lead_closed');
    const { rows } = await client.query<LeadRow>(
      `UPDATE crm.lead l
          SET state = 'disqualified', disqualify_reason = $2, disqualify_note = $3,
              closed_at = now(), closed_by_user_id = $4
        WHERE l.id = $1
        RETURNING ${COLUMNS}`,
      [id, reason, note, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmLeadDisqualified, id, { reason, from: row.state });
    return toLead(rows[0]!);
  });
}

/** „Redeschide leadul”: a disqualified lead comes back as new. */
export async function reopenLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
): Promise<Lead> {
  const id = requireId('leadId', leadId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await writableLead(client, ctx, scope, id);
    if (row.state !== 'disqualified') throw new Conflict('lead_not_disqualified');
    const { rows } = await client.query<LeadRow>(
      `UPDATE crm.lead l
          SET state = 'new', disqualify_reason = NULL, disqualify_note = NULL,
              closed_at = NULL, closed_by_user_id = NULL
        WHERE l.id = $1
        RETURNING ${COLUMNS}`,
      [id],
    );
    await audit(exec, ctx, AuditActions.crmLeadUpdated, id, {
      fields: ['state'],
      from: 'disqualified',
      state: 'new',
    });
    return toLead(rows[0]!);
  });
}

/** Closes an open lead as converted into `contactId`, in the open transaction. */
async function closeAsConverted(
  client: PoolClient,
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
  contactId: string,
  linked: boolean,
): Promise<LeadRow> {
  const row = await writableLead(client, ctx, scope, leadId);
  if (!OPEN_STATES.includes(row.state)) throw new Conflict('lead_closed');
  const { rows } = await client.query<LeadRow>(
    `UPDATE crm.lead l
        SET state = 'converted', converted_contact_id = $2, closed_at = now(), closed_by_user_id = $3
      WHERE l.id = $1
      RETURNING ${COLUMNS}`,
    [leadId, contactId, ctx.userId],
  );
  await audit(exec, ctx, AuditActions.crmLeadConverted, leadId, {
    contactId,
    linked,
    source: row.source,
  });
  return rows[0]!;
}

/**
 * „Convertește”: `contactId` links the lead to an existing contact (visible, not in the bin);
 * otherwise a new contact from the lead (its name, phone, e-mail unless given; its owner, or the
 * caller when unassigned), which takes one unit of crm.contacts.
 */
export async function convertLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
  input: {
    contactId?: unknown;
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    /** CR.9: „Creează și un deal” (S131): its title, pipeline and stage; the lead's budget as value. */
    deal?: { title?: unknown; pipelineId?: unknown; stageId?: unknown } | null;
  },
): Promise<{ lead: Lead; contact: { id: string; created: boolean }; dealId: string | null }> {
  const id = requireId('leadId', leadId);
  const lead = await withCrmTx(
    ctx.organizationId,
    async (client) => {
      const row = await readLead(client, id);
      if (!visible(ctx, scope, row)) throw new Forbidden();
      if (row.deleted_at) throw new Conflict('lead_deleted');
      if (!OPEN_STATES.includes(row.state)) throw new Conflict('lead_closed');
      return row;
    },
    true,
  );

  if (input.contactId !== undefined && input.contactId !== null) {
    const contactId = requireId('contactId', input.contactId);
    const closed = await withCrmTx(ctx.organizationId, async (client, exec) => {
      await readSubject(client, ctx, scope, 'contact', contactId, { write: true });
      return closeAsConverted(client, exec, ctx, scope, id, contactId, true);
    });
    const dealId = await dealFromLead(ctx, scope, lead, contactId, input.deal);
    return { lead: toLead(closed), contact: { id: contactId, created: false }, dealId };
  }

  let closed: LeadRow | undefined;
  const contact: Contact = await createContactInOrg(
    ctx,
    scope,
    {
      name: input.name === undefined ? lead.name : input.name,
      phone: input.phone === undefined ? lead.phone : input.phone,
      email: input.email === undefined ? lead.email : input.email,
      ownerUserId: lead.owner_user_id ?? ctx.userId,
    },
    {
      systemSource: CONTACT_SOURCE[lead.source],
      inTx: async (client, exec, created) => {
        closed = await closeAsConverted(client, exec, ctx, scope, id, created.id, false);
      },
    },
  );
  const dealId = await dealFromLead(ctx, scope, lead, contact.id, input.deal);
  return { lead: toLead(closed!), contact: { id: contact.id, created: true }, dealId };
}

/**
 * After the conversion (its own transaction: the lead is converted even if the deal is refused,
 * and the error says why): the deal on the contact, linked to the lead, the budget as its value.
 */
async function dealFromLead(
  ctx: TenantContext,
  scope: ContactScope,
  lead: LeadRow,
  contactId: string,
  deal: { title?: unknown; pipelineId?: unknown; stageId?: unknown } | null | undefined,
): Promise<string | null> {
  if (!deal) return null;
  const title = deal.title === undefined ? lead.name : deal.title;
  const budget = lead.budget_minor === null ? null : Number(lead.budget_minor);
  const created = await createDealInOrg(ctx, scope, {
    title,
    contactId,
    leadId: lead.id,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    currency: lead.currency === 'EUR' ? 'EUR' : 'RON',
    items: budget
      ? [
          {
            name: typeof title === 'string' ? title : lead.name,
            quantity: 1,
            unitPriceMinor: budget,
          },
        ]
      : [],
    ownerUserId: lead.owner_user_id ?? ctx.userId,
  });
  return created.id;
}

/** „Șterge”: into the bin (a converted lead stays: it is the contact's history). */
export async function deleteLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
): Promise<Lead> {
  const id = requireId('leadId', leadId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const row = await readLead(client, id, true);
    if (!visible(ctx, scope, row)) throw new Forbidden();
    if (row.deleted_at) return toLead(row);
    if (row.state === 'converted') throw new Conflict('lead_converted');
    const { rows } = await client.query<LeadRow>(
      `UPDATE crm.lead l SET deleted_at = now(), deleted_by_user_id = $2 WHERE l.id = $1
       RETURNING ${COLUMNS}`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmLeadDeleted, id, { state: row.state });
    return toLead(rows[0]!);
  });
}

// ── read ───────────────────────────────────────────────────────────────────────────────────────

export async function getLeadInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  leadId: string,
): Promise<Lead> {
  const id = requireId('leadId', leadId);
  const row = await withCrmTx(ctx.organizationId, (client) => readLead(client, id), true);
  if (!visible(ctx, scope, row)) throw new Forbidden();
  return toLead(row);
}

export type ListLeadsParams = {
  /** Name, phone, e-mail or the request. */
  q?: unknown;
  /** „Deschise” (new, contacted), „Calificate”, „Închise” (disqualified, converted), or one state. */
  tab?: unknown;
  state?: unknown;
  source?: unknown;
  /** 'me', 'none' („Neatribuit”) or a member's id. */
  owner?: unknown;
  /** Open leads with no note or activity (or arrival) for at least N days. */
  idleDays?: unknown;
  /** 'newest' (default) or 'score' (CR.10; the highest first). */
  sort?: unknown;
  limit?: unknown;
  offset?: unknown;
};

const TABS: Record<string, readonly LeadState[]> = {
  open: ['new', 'contacted'],
  qualified: ['qualified'],
  closed: ['disqualified', 'converted'],
};

/** The last touch of a lead: its arrival, its last note, its last activity. */
const LAST_TOUCH = `GREATEST(
  l.created_at,
  (SELECT max(n.created_at) FROM crm.note n
    WHERE n.subject_type = 'lead' AND n.subject_id = l.id AND n.deleted_at IS NULL),
  (SELECT max(COALESCE(a.done_at, a.created_at)) FROM crm.activity a
    WHERE a.subject_type = 'lead' AND a.subject_id = l.id AND a.deleted_at IS NULL)
)`;

function filters(ctx: TenantContext, scope: ContactScope, params: ListLeadsParams) {
  const where: string[] = ['l.deleted_at IS NULL'];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  if (scope !== 'all') {
    const me = arg(ctx.userId);
    where.push(`(l.owner_user_id IS NULL OR l.owner_user_id = ${me}::uuid)`);
  }
  if (params.q !== undefined && params.q !== '') {
    if (typeof params.q !== 'string' || params.q.length > 100)
      throw new InvalidInput('q', 'invalid');
    const p = arg(likePattern(params.q.trim().toLowerCase()));
    where.push(`(lower(l.name) LIKE ${p} OR l.phone LIKE ${p} OR l.email LIKE ${p}
      OR lower(l.request) LIKE ${p})`);
  }
  if (params.state !== undefined)
    where.push(`l.state = ${arg(oneOf('state', LEAD_STATES, params.state))}`);
  if (params.source !== undefined) {
    where.push(`l.source = ${arg(oneOf('source', LEAD_SOURCES, params.source))}`);
  }
  if (params.owner === 'me') where.push(`l.owner_user_id = ${arg(ctx.userId)}::uuid`);
  else if (params.owner === 'none') where.push('l.owner_user_id IS NULL');
  else if (isUuid(params.owner)) where.push(`l.owner_user_id = ${arg(params.owner)}::uuid`);
  else if (params.owner !== undefined) throw new InvalidInput('owner', 'invalid');
  if (params.idleDays !== undefined) {
    const n = params.idleDays;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > LEAD_LIMITS.idleDaysMax) {
      throw new InvalidInput('idleDays', 'invalid');
    }
    where.push(`l.state IN ('new', 'contacted', 'qualified')`);
    where.push(`${LAST_TOUCH} < now() - make_interval(days => ${arg(n)}::int)`);
  }
  return { where, args, arg };
}

/** The inbox, newest first. */
export async function listLeadsInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: ListLeadsParams,
): Promise<Lead[]> {
  const { limit, offset } = page(params);
  const { where, args, arg } = filters(ctx, scope, params);
  if (params.tab !== undefined) {
    const states = TABS[String(params.tab)];
    if (!states || typeof params.tab !== 'string') throw new InvalidInput('tab', 'invalid');
    where.push(`l.state = ANY(${arg(states)}::text[])`);
  }
  if (params.sort !== undefined && params.sort !== 'newest' && params.sort !== 'score') {
    throw new InvalidInput('sort', 'invalid');
  }
  // CR.10: by score (the S131 rules in SQL), the newest among equals
  const order =
    params.sort === 'score'
      ? `${scoreSql('(SELECT s.lead_min_budget_minor FROM crm.settings s)')} DESC,`
      : '';
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<LeadRow>(
        `SELECT ${COLUMNS} FROM crm.lead l
          WHERE ${where.join(' AND ')}
          ORDER BY ${order} l.created_at DESC, l.id DESC
          LIMIT ${arg(limit)} OFFSET ${arg(offset)}`,
        args,
      );
      return rows.map(toLead);
    },
    true,
  );
}

/** „Deschise · 5” / „Calificate · 1” / „Închise · 14”, with the same filters. */
export async function countLeadsInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: Omit<ListLeadsParams, 'tab' | 'limit' | 'offset'>,
): Promise<{ open: number; qualified: number; closed: number }> {
  const { where, args } = filters(ctx, scope, params);
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const { rows } = await client.query<{ open: string; qualified: string; closed: string }>(
        `SELECT count(*) FILTER (WHERE l.state IN ('new', 'contacted')) AS open,
                count(*) FILTER (WHERE l.state = 'qualified') AS qualified,
                count(*) FILTER (WHERE l.state IN ('disqualified', 'converted')) AS closed
           FROM crm.lead l
          WHERE ${where.join(' AND ')}`,
        args,
      );
      const r = rows[0]!;
      return { open: Number(r.open), qualified: Number(r.qualified), closed: Number(r.closed) };
    },
    true,
  );
}
