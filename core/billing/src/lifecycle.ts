import type { PoolClient } from 'pg';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import {
  billingPeriod,
  calendarDate,
  endSubscriptionTrial,
  getBillingTerms,
  listSetupRequests,
  listSubscriptionTrialsDue,
  markSetupPaidByFounder,
  openDunning,
  refundSetupByFounder,
  resolveDunningPaid,
  getSetupRequestForFounder,
  type SetupRequestRow,
} from '@ventora/commercial';
import { BillingProfileChangedV1, BillingTransferReceivedV1 } from '@ventora/contracts';
import { uuidv7, writeOutboxEvent, type OutboxSqlClient } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { requireFounderSession } from '@ventora/identity';
import { assertBuyer, readAccountInTx, type BillingContext } from './account';
import {
  checkForeignVatCode,
  checkRegCom,
  checkRomanianCui,
  normalizeTaxId,
} from './billing-profile';
import { withBillingFounder, withBillingModule, withBillingRead, withBillingWrite } from './db';
import {
  invoiceAppName,
  issueInvoice,
  profileBuyerInTx,
  romanianDate,
  romanianMonth,
  type IssueOutcome,
} from './invoices';
import { getInvoiceProvider, InvoiceProviderError, type InvoiceLine } from './invoice-provider';
import { applyPaymentIntentInTx } from './purchases';
import { reportBillingError } from './report';
import { reconcileSubscription } from './subscriptions';
import { getStripeGateway, type PaymentIntentState } from './stripe';

/*
 * Lot 3.8 — the billing side of the commercial life cycle, on migration
 * 20261104000021_billing_lifecycle (the triggers decide, per role):
 *
 *   - the billing profile (D-3.6-1): written by the Ventora team in Founder, with a reason in the
 *     business's log; read-only in the Hub, for the owner; every invoice photographs it;
 *   - manual payment by transfer (D3-11): the team marks the business, with its payment terms
 *     (1–90 days, 14 by default, N6); the job issues the invoice of every period first, with its
 *     due date; the team confirms the receipt (the whole amount); past the due date, a
 *     non-payment case (core/commercial, D3-12);
 *   - the invoice not issued (D-3.6-5): „Reîncearcă” (the buyer photographed again) and
 *     „Am emis-o manual” (series, number, date, reason);
 *   - the payment of an implementation (S121): with the saved card (a PaymentIntent, as for a pack)
 *     or by transfer (the invoice first); the refund until live: the card back (the storno follows
 *     from Stripe), or the storno of the transfer invoice.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PAYMENT_TERMS_MIN = 1;
export const PAYMENT_TERMS_MAX = 90;
export const PAYMENT_TERMS_DEFAULT = 14;
export const PROFILE_REASON_MIN = 1;
export const MANUAL_REASON_MIN = 10;
export const REASON_MAX = 1000;

function uuid(field: string, value: string): string {
  if (!UUID_RE.test(value ?? '')) throw new InvalidInput(field);
  return value;
}

/** Days after a YYYY-MM-DD, as YYYY-MM-DD. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dbHint(err: unknown): string | undefined {
  return (err as { hint?: string } | null)?.hint;
}

// ── the billing profile ─────────────────────────────────────────────────────────────────────

export interface BillingProfileInput {
  entityType: 'company' | 'person';
  name: string;
  /** ISO 3166-1 alpha-2, „RO” by default. */
  country: string;
  /** The CUI (RO) or the VAT code with the country prefix (abroad); null for a person. */
  taxId: string | null;
  /** Nr. Reg. Com. (RO, required for a company) / the registration number abroad (optional). */
  regCom: string | null;
  street: string;
  city: string;
  /** „Județ” in Romania (required), „Regiune” abroad (optional). */
  county: string | null;
  email: string;
}

export interface BillingProfile extends BillingProfileInput {
  createdAt: Date;
  updatedAt: Date;
}

/** The field errors the form names (founder.billingProfile.*Err*). */
export type BillingProfileError =
  | 'name'
  | 'cuiFormat'
  | 'cuiControl'
  | 'vatCode'
  | 'regCom'
  | 'street'
  | 'city'
  | 'county'
  | 'email'
  | 'country';

export class BillingProfileInvalid extends InvalidInput {
  constructor(readonly errors: BillingProfileError[]) {
    super(errors[0] ?? 'profile', `Billing profile: ${errors.join(', ')}`);
    this.name = 'BillingProfileInvalid';
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The same rules as the database (billing_profile CHECKs), with the form's names for errors. */
export function validateBillingProfile(input: BillingProfileInput): BillingProfileInput {
  const errors: BillingProfileError[] = [];
  const trim = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
  const country = trim(input.country || 'RO').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) errors.push('country');
  const entityType = input.entityType === 'person' ? 'person' : 'company';
  const name = trim(input.name);
  if (name.length < 2 || name.length > 255) errors.push('name');
  let taxId: string | null = null;
  let regCom: string | null = null;
  if (entityType === 'company') {
    const raw = normalizeTaxId(input.taxId ?? '');
    if (country === 'RO') {
      const check = checkRomanianCui(raw);
      if (check === 'format') errors.push('cuiFormat');
      if (check === 'control') errors.push('cuiControl');
      taxId = raw;
      const rc = (input.regCom ?? '').replace(/\s+/g, '').toUpperCase();
      if (!checkRegCom(rc)) errors.push('regCom');
      regCom = rc;
    } else {
      if (!checkForeignVatCode(raw)) errors.push('vatCode');
      taxId = raw;
      const rc = trim(input.regCom).toUpperCase();
      if (rc && !/^[0-9A-Z][0-9A-Z/.\- ]{1,31}$/.test(rc)) errors.push('regCom');
      regCom = rc || null;
    }
  }
  const street = trim(input.street);
  if (street.length < 2 || street.length > 255) errors.push('street');
  const city = trim(input.city);
  if (city.length < 2 || city.length > 128) errors.push('city');
  const county = trim(input.county) || null;
  if (country === 'RO' && !county) errors.push('county');
  if (county && county.length > 128) errors.push('county');
  const email = trim(input.email).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 255) errors.push('email');
  if (errors.length) throw new BillingProfileInvalid(errors);
  return { entityType, name, country, taxId, regCom, street, city, county, email };
}

type ProfileDb = {
  entity_type: 'company' | 'person';
  name: string;
  country: string;
  tax_id: string | null;
  reg_com: string | null;
  street: string;
  city: string;
  county: string | null;
  email: string;
  created_at: Date;
  updated_at: Date;
};

const PROFILE_COLUMNS = `entity_type, name, country, tax_id, reg_com, street, city, county, email,
  created_at, updated_at`;

const toProfile = (r: ProfileDb): BillingProfile => ({
  entityType: r.entity_type,
  name: r.name,
  country: r.country,
  taxId: r.tax_id,
  regCom: r.reg_com,
  street: r.street,
  city: r.city,
  county: r.county,
  email: r.email,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function readProfileInTx(client: PoolClient): Promise<BillingProfile | null> {
  const { rows } = await client.query<ProfileDb>(
    `SELECT ${PROFILE_COLUMNS} FROM billing.billing_profile LIMIT 1`,
  );
  return rows[0] ? toProfile(rows[0]) : null;
}

/** FounderBillingProfile: the business's profile (null: not entered yet). */
export async function getBillingProfileForFounder(params: {
  founderHeaders: Headers;
  organizationId: string;
}): Promise<BillingProfile | null> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  return withBillingFounder(organizationId, readProfileInTx, { readOnly: true });
}

/**
 * „Salvează” (FounderBillingProfile / FounderNewBusiness): the profile, created or changed, with
 * the reason in the business's log (required on a change, S121 „Motivul schimbării”); the owner
 * gets an e-mail with the new data (`billing.profile.changed`). From the next invoice on: the
 * invoices already issued keep the buyer they were issued on.
 */
export async function saveBillingProfile(params: {
  founderHeaders: Headers;
  organizationId: string;
  profile: BillingProfileInput;
  reason: string | null;
}): Promise<{ created: boolean }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const p = validateBillingProfile(params.profile);
  const reason = params.reason?.trim() || null;
  if (reason && reason.length > REASON_MAX) throw new InvalidInput('reason');
  return withBillingFounder(organizationId, async (client, exec) => {
    const before = await readProfileInTx(client);
    if (before && !reason) throw new InvalidInput('reason', 'A reason for the change');
    await client.query(
      `INSERT INTO billing.billing_profile
         (organization_id, entity_type, name, country, tax_id, reg_com, street, city, county, email,
          created_by_founder_id, updated_by_founder_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       ON CONFLICT (organization_id) DO UPDATE
         SET entity_type = EXCLUDED.entity_type, name = EXCLUDED.name, country = EXCLUDED.country,
             tax_id = EXCLUDED.tax_id, reg_com = EXCLUDED.reg_com, street = EXCLUDED.street,
             city = EXCLUDED.city, county = EXCLUDED.county, email = EXCLUDED.email,
             updated_by_founder_id = EXCLUDED.updated_by_founder_id, updated_at = now()`,
      [
        organizationId,
        p.entityType,
        p.name,
        p.country,
        p.taxId,
        p.regCom,
        p.street,
        p.city,
        p.county,
        p.email,
        founder.userId,
      ],
    );
    const changed = before
      ? (Object.keys(p) as Array<keyof BillingProfileInput>).filter((k) => before[k] !== p[k])
      : (Object.keys(p) as Array<keyof BillingProfileInput>);
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.billingProfileSaved,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId,
      targetType: 'billing_profile',
      targetId: organizationId,
      // the field names only: the data itself is the business's, not the log's
      metadata: { created: !before, changed, ...(reason ? { reason } : {}) },
    });
    await writeOutboxEvent(client, 'billing', BillingProfileChangedV1, {
      organizationId,
      sourceApp: BillingProfileChangedV1.sourceApp,
      resourceId: organizationId,
      payload: { changedByFounderId: founder.userId, created: !before },
    });
    return { created: !before };
  });
}

/**
 * HubBillingProfile: the profile, read-only, only for the owner (a member or an admin sees one
 * line instead; S121). `role` comes from authorize().
 */
export async function getBillingProfile(
  ctx: BillingContext & { role: string },
): Promise<BillingProfile | null> {
  if (!UUID_RE.test(ctx?.organizationId ?? '')) throw new InvalidInput('organizationId');
  if (ctx.role !== 'owner') throw new Forbidden('Only the owner sees the billing data');
  return withBillingRead(ctx.organizationId, readProfileInTx);
}

/** The e-mail of `billing.profile.changed`: the new data, read in the consumer's transaction. */
export async function billingProfileForNoticeInTx(
  tx: Pick<OutboxSqlClient, 'query'>,
): Promise<ReturnType<typeof profileBuyerInTx>> {
  return profileBuyerInTx(tx as Pick<PoolClient, 'query'>);
}

// ── manual payment by transfer (D3-11) ──────────────────────────────────────────────────────

export interface PaymentSettings {
  method: 'card' | 'manual';
  paymentTermsDays: number;
}

/** FounderBusinessBilling: how the business pays (card by default) and its payment terms. */
export async function getPaymentSettingsForFounder(params: {
  founderHeaders: Headers;
  organizationId: string;
}): Promise<PaymentSettings> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  return withBillingFounder(
    organizationId,
    async (client) => {
      const { rows } = await client.query<{
        payment_method: 'card' | 'manual';
        payment_terms_days: number;
      }>(`SELECT payment_method, payment_terms_days FROM billing.billing_subscription LIMIT 1`);
      return {
        method: rows[0]?.payment_method ?? 'card',
        paymentTermsDays: rows[0]?.payment_terms_days ?? PAYMENT_TERMS_DEFAULT,
      };
    },
    { readOnly: true },
  );
}

/**
 * The team sets the business on transfer („plată manuală”) or back on the card, with the payment
 * terms (1–90 days, N6). A business on transfer asks instead of buying (Lot 3.5 `PurchaseRefused`).
 */
export async function setPaymentSettings(params: {
  founderHeaders: Headers;
  organizationId: string;
  method: 'card' | 'manual';
  paymentTermsDays: number;
}): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  if (params.method !== 'card' && params.method !== 'manual') throw new InvalidInput('method');
  const days = params.paymentTermsDays;
  if (!Number.isInteger(days) || days < PAYMENT_TERMS_MIN || days > PAYMENT_TERMS_MAX) {
    throw new InvalidInput('paymentTermsDays');
  }
  const terms = await getBillingTerms(organizationId);
  if (!terms) throw new InvalidInput('organizationId', 'The business has no subscription');
  await withBillingFounder(organizationId, async (client, exec) => {
    await client
      .query(
        `INSERT INTO billing.billing_subscription
         (organization_id, subscription_id, payment_method, payment_terms_days)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id) DO UPDATE
         SET payment_method = EXCLUDED.payment_method,
             payment_terms_days = EXCLUDED.payment_terms_days, updated_at = now()`,
        [organizationId, terms.subscription.id, params.method, days],
      )
      .catch((err) => {
        // billing_subscription_manual: a Stripe subscription still linked (cancel it first)
        if ((err as { code?: string }).code === '23514')
          throw new Conflict('stripe_subscription_linked');
        throw err;
      });
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.billingPaymentMethodSet,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId,
      targetType: 'billing_subscription',
      targetId: organizationId,
      metadata: { method: params.method, paymentTermsDays: days },
    });
  });
}

/** The lines of a period's transfer invoice and its total; null when it cannot be priced. */
type TransferTerms = NonNullable<Awaited<ReturnType<typeof getBillingTerms>>>;

/** A line's days before the period being invoiced (E3): billed once, as a separate line. */
interface CatchUpLine {
  lineId: string;
  applicationId: string;
  days: number;
  amountMinor: number;
  label: string;
}

const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * E3 (05.11.2026), transfer: an application that started during the previous period, after
 * that period's invoice was made (for instance by „Pornește aplicația”), was not on it. Its days
 * up to the new period go on the new invoice as a separate line, prorated by day. Nothing before
 * a first invoice (the trial, or a business new on transfer): only the period itself is billed.
 */
export function catchUpLines(
  terms: TransferTerms,
  period: { start: string },
  previous: { start: string; invoicedAt: Date } | null,
): CatchUpLine[] {
  if (!previous) return [];
  const total = dayCount(previous.start, period.start);
  if (total <= 0) return [];
  const label =
    terms.subscription.interval === 'year'
      ? previous.start.slice(0, 4)
      : romanianMonth(new Date(`${previous.start}T12:00:00Z`));
  const out: CatchUpLine[] = [];
  for (const a of terms.applications) {
    const startedAt = new Date(a.startedAt);
    if (startedAt <= previous.invoicedAt) continue;
    const from = romanianDate(startedAt);
    if (from >= period.start) continue;
    const days = dayCount(from < previous.start ? previous.start : from, period.start);
    const amountMinor = Math.round((a.amountMinor * days) / total);
    if (days > 0 && amountMinor > 0) {
      out.push({ lineId: a.lineId, applicationId: a.applicationId, days, amountMinor, label });
    }
  }
  return out;
}

function periodLines(
  terms: TransferTerms,
  periodStart: string,
  catchUp: CatchUpLine[] = [],
): { lines: InvoiceLine[]; totalMinor: number } | { refused: 'discount' } {
  // only „forever” discounts are certain on every invoice; once / repeating need their first
  // invoice, which a transfer business does not have in Stripe (NECESITĂ DECIZIE, Lot 3.8 report)
  if (terms.discounts.some((d) => d.duration !== 'forever')) return { refused: 'discount' };
  const at = new Date(`${periodStart}T12:00:00Z`);
  const period =
    terms.subscription.interval === 'year' ? periodStart.slice(0, 4) : romanianMonth(at);
  const lines: Array<InvoiceLine & { lineId: string | null }> = [];
  if (terms.bundle && terms.bundle.priceMinor > 0) {
    lines.push({
      lineId: null,
      name: `Abonament ${terms.bundle.planName.trim() || 'Ventora Systems'} · ${period}`,
      code: 'VNT-SUB',
      quantity: 1,
      unitMinor: terms.bundle.priceMinor,
    });
  }
  for (const a of terms.applications) {
    lines.push({
      lineId: a.lineId,
      name: `${invoiceAppName(a.applicationId)} · ${period}`,
      code: 'VNT-APP',
      quantity: 1,
      unitMinor: a.amountMinor,
    });
  }
  for (const c of catchUp) {
    lines.push({
      lineId: c.lineId,
      name: `${invoiceAppName(c.applicationId)} · ${c.days} ${c.days === 1 ? 'zi' : 'zile'} din ${c.label}`,
      code: 'VNT-APP',
      quantity: 1,
      unitMinor: c.amountMinor,
    });
  }
  // the discounts folded into the lines (a line's on its lines; the subscription's spread)
  for (const d of terms.discounts.filter((x) => x.scope !== 'subscription')) {
    for (const line of lines.filter((l) => l.lineId === d.lineId)) {
      const off =
        d.kind === 'percent'
          ? Math.round((line.unitMinor * (d.percentOff ?? 0)) / 100)
          : (d.amountOffMinor ?? 0);
      line.unitMinor -= Math.min(off, line.unitMinor);
    }
  }
  for (const d of terms.discounts.filter((x) => x.scope === 'subscription')) {
    const sum = lines.reduce((s, l) => s + l.unitMinor, 0);
    const off = Math.min(
      d.kind === 'percent'
        ? Math.round((sum * (d.percentOff ?? 0)) / 100)
        : (d.amountOffMinor ?? 0),
      sum,
    );
    let left = off;
    lines.forEach((l, i) => {
      const part = i === lines.length - 1 ? left : Math.round((off * l.unitMinor) / (sum || 1));
      const take = Math.min(part, l.unitMinor, left);
      l.unitMinor -= take;
      left -= take;
    });
  }
  const out = lines.filter((l) => l.unitMinor > 0).map(({ lineId: _l, ...l }) => l);
  return { lines: out, totalMinor: out.reduce((s, l) => s + l.unitMinor, 0) };
}

/**
 * The job (`billing.transfer-invoices`, daily): every business on transfer gets the invoice of
 * its current period once (unique on the period), issued first with the due date = today + the
 * business's terms. Then the issuing job sends it to SmartBill. A business still on trial, or
 * with nothing to bill, is skipped.
 */
export async function runTransferInvoiceJob(opts: { limit?: number; now?: Date } = {}): Promise<{
  checked: number;
  created: number;
  errors: Array<{ organizationId: string; error: unknown }>;
}> {
  const now = opts.now ?? new Date();
  const { rows } = await withBillingModule((client) =>
    client.query<{ organization_id: string; payment_terms_days: number }>(
      `SELECT organization_id, payment_terms_days FROM billing.manual_billing_organizations($1)`,
      [opts.limit ?? 500],
    ),
  );
  let created = 0;
  const errors: Array<{ organizationId: string; error: unknown }> = [];
  for (const r of rows) {
    try {
      const terms = await getBillingTerms(r.organization_id);
      if (!terms || terms.subscription.status !== 'active') continue;
      const today = calendarDate(now);
      const period = billingPeriod(
        { startedOn: terms.subscription.startedOn, interval: terms.subscription.interval },
        today,
      );
      // E3: the days of a line started after the previous period's invoice, as a separate line
      const previous =
        period.start > terms.subscription.startedOn
          ? billingPeriod(
              {
                startedOn: terms.subscription.startedOn,
                interval: terms.subscription.interval,
              },
              addDays(period.start, -1),
            )
          : null;
      const invoicedAt = previous
        ? await withBillingRead(r.organization_id, async (client) => {
            const { rows: prev } = await client.query<{ created_at: Date }>(
              `SELECT created_at FROM billing.invoice
                WHERE kind = 'invoice' AND collection = 'transfer' AND period_start = $1::date`,
              [previous.start],
            );
            return prev[0]?.created_at ?? null;
          })
        : null;
      const catchUp = catchUpLines(
        terms,
        period,
        previous && invoicedAt ? { start: previous.start, invoicedAt } : null,
      );
      const priced = periodLines(terms, period.start, catchUp);
      if ('refused' in priced) {
        errors.push({
          organizationId: r.organization_id,
          error: new Conflict('A once / repeating discount on a transfer business: issue by hand'),
        });
        continue;
      }
      if (!priced.totalMinor) continue;
      const done = await withBillingWrite(r.organization_id, async (client, exec) => {
        const id = uuidv7();
        const { rowCount } = await client.query(
          `INSERT INTO billing.invoice
             (id, organization_id, kind, collection, provider, amount_minor, currency, due_on,
              period_start, lines)
           VALUES ($1, $2, 'invoice', 'transfer', $3, $4, $5, $6::date, $7::date, $8::jsonb)
           ON CONFLICT (organization_id, period_start)
             WHERE kind = 'invoice' AND period_start IS NOT NULL DO NOTHING`,
          [
            id,
            r.organization_id,
            getInvoiceProvider().name,
            priced.totalMinor,
            terms.subscription.currency,
            addDays(romanianDate(now), r.payment_terms_days),
            period.start,
            JSON.stringify(priced.lines),
          ],
        );
        if (!rowCount) return false;
        await auditTransferInvoiced(exec, r.organization_id, id, {
          periodStart: period.start,
          amountMinor: priced.totalMinor,
        });
        return true;
      });
      if (done) created++;
    } catch (error) {
      errors.push({ organizationId: r.organization_id, error });
    }
  }
  return { checked: rows.length, created, errors };
}

async function auditTransferInvoiced(
  exec: AuditSqlExecutor,
  organizationId: string,
  invoiceId: string,
  metadata: Record<string, unknown>,
  founderId?: string,
): Promise<void> {
  await appendAuditEventInTx(exec, {
    category: 'commercial',
    action: AuditActions.billingTransferInvoiced,
    outcome: 'success',
    actorType: founderId ? 'founder' : 'system',
    ...(founderId ? { actorId: founderId, founderId } : {}),
    organizationId,
    targetType: 'invoice',
    targetId: invoiceId,
    metadata,
  });
}

/**
 * The job (`billing.transfer-overdue`, daily): an issued transfer invoice past its due date,
 * unpaid → a non-payment case (D3-12) from the day after the due date; 14 days of grace.
 */
export async function runTransferOverdueJob(opts: { limit?: number } = {}): Promise<{
  overdue: number;
  opened: number;
  errors: Array<{ invoiceId: string; error: unknown }>;
}> {
  const { rows } = await withBillingModule((client) =>
    client.query<{
      id: string;
      organization_id: string;
      due_on: string;
      amount_minor: string;
      currency: 'RON' | 'EUR';
    }>(
      `SELECT id, organization_id, due_on::text AS due_on, amount_minor::text AS amount_minor, currency
         FROM billing.transfer_invoices_overdue($1)`,
      [opts.limit ?? 200],
    ),
  );
  let opened = 0;
  const errors: Array<{ invoiceId: string; error: unknown }> = [];
  for (const r of rows) {
    try {
      const res = await openDunning({
        organizationId: r.organization_id,
        cause: 'transfer',
        sourceRef: r.id,
        amountMinor: Number(r.amount_minor),
        currency: r.currency,
        // the day after the due date, at midnight in Romania (≈ 22:00 / 21:00 UTC the day before)
        overdueSince: new Date(`${addDays(r.due_on, 1)}T00:00:00+02:00`),
      });
      if (res.opened) opened++;
    } catch (error) {
      errors.push({ invoiceId: r.id, error });
    }
  }
  return { overdue: rows.length, opened, errors };
}

/**
 * „Confirmă încasarea” (FounderBusinessBilling): the team saw the transfer for an issued invoice —
 * the whole amount (the trigger checks it), on a day not in the future. The payment row
 * (`transfer`), the invoice paid, the audit row and `billing.transfer.received` (the SmartBill
 * receipt, N16) together; then the non-payment case of the invoice closes, and an
 * implementation's request goes `paid`.
 */
export async function confirmTransferReceipt(params: {
  founderHeaders: Headers;
  organizationId: string;
  invoiceId: string;
  receivedOn: string;
}): Promise<{ paymentId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const invoiceId = uuid('invoiceId', params.invoiceId);
  if (!DATE_RE.test(params.receivedOn ?? '')) throw new InvalidInput('receivedOn');
  if (params.receivedOn > romanianDate(new Date())) throw new InvalidInput('receivedOn');
  const result = await withBillingFounder(organizationId, async (client, exec) => {
    const { rows } = await client.query<{
      collection: string;
      status: string;
      paid_on: string | null;
      amount_minor: string;
      currency: 'RON' | 'EUR';
      setup_request_id: string | null;
    }>(
      `SELECT collection, status, paid_on::text AS paid_on, amount_minor::text AS amount_minor,
              currency, setup_request_id
         FROM billing.invoice WHERE id = $1 AND kind = 'invoice' FOR UPDATE`,
      [invoiceId],
    );
    const inv = rows[0];
    if (!inv) throw new ResourceNotFound('Invoice not found');
    if (inv.collection !== 'transfer')
      throw new InvalidInput('invoiceId', 'Not a transfer invoice');
    if (inv.paid_on) throw new Conflict('invoice_paid');
    if (inv.status !== 'issued' && inv.status !== 'manual')
      throw new Conflict('invoice_not_issued');
    const paymentId = uuidv7();
    await client.query(
      `INSERT INTO billing.payment
         (id, organization_id, kind, idempotency_key, attempt, status, amount_minor, currency,
          occurred_at, received_on, confirmed_by_founder_id)
       VALUES ($1, $2, 'transfer', $3, 1, 'succeeded', $4, $5, now(), $6::date, $7)`,
      [
        paymentId,
        organizationId,
        `transfer:${invoiceId}`,
        inv.amount_minor,
        inv.currency,
        params.receivedOn,
        founder.userId,
      ],
    );
    await client
      .query(
        `UPDATE billing.invoice
            SET paid_on = $2::date, payment_id = $3, paid_confirmed_by_founder_id = $4
          WHERE id = $1`,
        [invoiceId, params.receivedOn, paymentId, founder.userId],
      )
      .catch((err) => {
        if (dbHint(err) === 'invoice_transfer_amount') throw new InvalidInput('amount');
        throw err;
      });
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.billingTransferReceived,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId,
      targetType: 'invoice',
      targetId: invoiceId,
      metadata: {
        paymentId,
        receivedOn: params.receivedOn,
        amountMinor: Number(inv.amount_minor),
        currency: inv.currency,
      },
    });
    await writeOutboxEvent(client, 'billing', BillingTransferReceivedV1, {
      organizationId,
      sourceApp: BillingTransferReceivedV1.sourceApp,
      resourceId: invoiceId,
      payload: {
        invoiceId,
        paymentId,
        amountMinor: Number(inv.amount_minor),
        currency: inv.currency,
        receivedOn: params.receivedOn,
      },
    });
    return {
      paymentId,
      setupRequestId: inv.setup_request_id,
      amountMinor: Number(inv.amount_minor),
    };
  });
  await resolveDunningPaid(organizationId, invoiceId).catch((err) =>
    reportBillingError('transfer.dunning-resolve', err, { organizationId }),
  );
  if (result.setupRequestId) {
    await markSetupPaidByFounder({
      founderHeaders: params.founderHeaders,
      organizationId,
      setupRequestId: result.setupRequestId,
      invoiceId,
      amountMinor: result.amountMinor,
    });
  }
  return { paymentId: result.paymentId };
}

/**
 * The consumer of `billing.transfer.received` (N16): the receipt recorded in SmartBill against
 * the invoice. A provider without receipts, or with them off, completes without a call (the
 * team records it in SmartBill by hand); a retryable error retries (the dispatcher).
 */
export const transferReceiptConsumer = {
  name: 'billing.transfer-receipt',
  handles: [{ type: BillingTransferReceivedV1.type, version: BillingTransferReceivedV1.version }],
  async handle(
    envelope: { organizationId: string; payload: unknown },
    tx: OutboxSqlClient,
  ): Promise<void> {
    const p = BillingTransferReceivedV1.parse(envelope.payload);
    const provider = getInvoiceProvider();
    if (!provider.recordPayment) return;
    const { rows } = (await tx.query(
      `SELECT series, number, buyer FROM billing.invoice WHERE id = $1`,
      [p.invoiceId],
    )) as { rows: Array<{ series: string | null; number: string | null; buyer: unknown }> };
    const inv = rows[0];
    if (!inv?.series || !inv.number) return;
    try {
      await provider.recordPayment({
        reference: p.invoiceId,
        series: inv.series,
        number: inv.number,
        date: p.receivedOn,
        amountMinor: p.amountMinor,
        currency: p.currency,
        buyer:
          (inv.buyer as Parameters<NonNullable<typeof provider.recordPayment>>[0]['buyer']) ??
          (await profileBuyerInTx(tx as Pick<PoolClient, 'query'>))!,
      });
    } catch (err) {
      // off until validated, or refused: Founder records it in SmartBill; retried only if retryable
      if (err instanceof InvoiceProviderError && err.kind === 'retryable') {
        if (/SMARTBILL_RECORD_PAYMENTS/.test(err.message)) return;
        throw err;
      }
      reportBillingError('transfer.smartbill-receipt', err, {
        organizationId: envelope.organizationId,
      });
    }
  },
};

// ── the invoice not issued (D-3.6-5) ────────────────────────────────────────────────────────

/**
 * „Reîncearcă”: a refused invoice goes back to `pending`, its buyer photographed again (after the
 * billing data was corrected), and is issued right away. The outcome as the row shows it.
 */
export async function retryInvoice(params: {
  founderHeaders: Headers;
  organizationId: string;
  invoiceId: string;
}): Promise<IssueOutcome> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const invoiceId = uuid('invoiceId', params.invoiceId);
  await withBillingFounder(organizationId, async (client, exec) => {
    const { rowCount } = await client
      .query(
        `UPDATE billing.invoice SET status = 'pending', retried_by_founder_id = $2
          WHERE id = $1 AND status = 'failed'`,
        [invoiceId, founder.userId],
      )
      .catch((err) => {
        if (dbHint(err)) throw new Conflict(dbHint(err)!);
        throw err;
      });
    if (!rowCount) throw new Conflict('invoice_not_failed');
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.billingInvoiceRetried,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId,
      targetType: 'invoice',
      targetId: invoiceId,
      metadata: {},
    });
  });
  return issueInvoice(organizationId, invoiceId);
}

/**
 * „Am emis-o manual…”: the team issued it in SmartBill by hand. Series, number, the issue date
 * (not in the future) and a reason of 10+ characters, into the business's log. A series and
 * number already used → `Conflict('invoice_number_used')`; an attempt running right now →
 * `Conflict('invoice_claimed')`.
 */
export async function markInvoiceManual(params: {
  founderHeaders: Headers;
  organizationId: string;
  invoiceId: string;
  series: string;
  number: string;
  issueDate: string;
  reason: string;
}): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const invoiceId = uuid('invoiceId', params.invoiceId);
  const series = String(params.series ?? '')
    .trim()
    .toUpperCase();
  const number = String(params.number ?? '').trim();
  if (!/^[A-Z0-9-]{1,16}$/.test(series)) throw new InvalidInput('series');
  if (!/^[0-9A-Za-z-]{1,32}$/.test(number)) throw new InvalidInput('number');
  if (!DATE_RE.test(params.issueDate ?? '') || params.issueDate > romanianDate(new Date())) {
    throw new InvalidInput('issueDate');
  }
  const reason = params.reason?.trim() ?? '';
  if (reason.length < MANUAL_REASON_MIN || reason.length > REASON_MAX) {
    throw new InvalidInput('reason');
  }
  await withBillingFounder(organizationId, async (client, exec) => {
    const { rowCount } = await client
      .query(
        `UPDATE billing.invoice
            SET status = 'manual', series = $2, number = $3, issue_date = $4::date,
                manual_reason = $5, manual_by_founder_id = $6
          WHERE id = $1 AND status IN ('failed', 'pending')`,
        [invoiceId, series, number, params.issueDate, reason, founder.userId],
      )
      .catch((err) => {
        if ((err as { code?: string }).code === '23505') throw new Conflict('invoice_number_used');
        if (dbHint(err)) throw new Conflict(dbHint(err)!);
        throw err;
      });
    if (!rowCount) throw new Conflict('invoice_not_open');
    await appendAuditEventInTx(exec, {
      category: 'commercial',
      action: AuditActions.billingInvoiceManual,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId,
      targetType: 'invoice',
      targetId: invoiceId,
      metadata: { series, number, issueDate: params.issueDate, reason },
    });
  });
}

export interface FounderInvoiceRow {
  id: string;
  kind: 'invoice' | 'storno';
  status: 'pending' | 'issued' | 'failed' | 'manual';
  collection: 'charge' | 'transfer';
  series: string | null;
  number: string | null;
  issueDate: string | null;
  dueOn: string | null;
  paidOn: string | null;
  amountMinor: number;
  currency: 'RON' | 'EUR';
  attempts: number;
  lastError: string | null;
  manualReason: string | null;
  /** What it is for: the first line's name („Abonament Business · noiembrie”). */
  what: string | null;
  /** The card payment's day (charge) or null. */
  paymentDate: string | null;
  setupRequestId: string | null;
  createdAt: Date;
}

/** FounderBusinessBilling · Plăți și facturi: the business's invoices, newest first. */
export async function listInvoicesForFounder(params: {
  founderHeaders: Headers;
  organizationId: string;
  limit?: number;
}): Promise<FounderInvoiceRow[]> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  return withBillingFounder(
    organizationId,
    async (client) => {
      const { rows } = await client.query<Record<string, unknown>>(
        `SELECT i.id, i.kind, i.status, i.collection, i.series, i.number,
                i.issue_date::text AS issue_date, i.due_on::text AS due_on,
                i.paid_on::text AS paid_on, i.amount_minor::text AS amount_minor, i.currency,
                i.attempts, i.last_error, i.manual_reason, i.lines -> 0 ->> 'name' AS what,
                p.occurred_at AS payment_at, i.setup_request_id, i.created_at
           FROM billing.invoice i
           LEFT JOIN billing.payment p ON p.id = i.payment_id
          ORDER BY i.created_at DESC
          LIMIT $1`,
        [Math.min(Math.max(params.limit ?? 50, 1), 200)],
      );
      return rows.map((r) => ({
        id: r.id as string,
        kind: r.kind as 'invoice' | 'storno',
        status: r.status as FounderInvoiceRow['status'],
        collection: r.collection as 'charge' | 'transfer',
        series: (r.series as string | null) ?? null,
        number: (r.number as string | null) ?? null,
        issueDate: (r.issue_date as string | null) ?? null,
        dueOn: (r.due_on as string | null) ?? null,
        paidOn: (r.paid_on as string | null) ?? null,
        amountMinor: Number(r.amount_minor),
        currency: r.currency as 'RON' | 'EUR',
        attempts: Number(r.attempts),
        lastError: (r.last_error as string | null) ?? null,
        manualReason: (r.manual_reason as string | null) ?? null,
        what: (r.what as string | null) ?? null,
        paymentDate: r.payment_at ? romanianDate(r.payment_at as Date) : null,
        setupRequestId: (r.setup_request_id as string | null) ?? null,
        createdAt: r.created_at as Date,
      }));
    },
    { readOnly: true },
  );
}

// ── the trial of the whole subscription (N4) ────────────────────────────────────────────────

/**
 * The job (`commercial.subscription-trial-end`, hourly): every subscription past its trial —
 * with a card or on transfer it goes `active` (the card: the Stripe subscription charges from
 * now on); without either, read-only at once (core/commercial, grace 0).
 */
export async function runSubscriptionTrialJob(opts: { limit?: number } = {}): Promise<{
  ended: number;
  readOnly: number;
  errors: Array<{ organizationId: string; error: unknown }>;
}> {
  const due = await listSubscriptionTrialsDue(opts.limit ?? 100);
  let ended = 0;
  let readOnly = 0;
  const errors: Array<{ organizationId: string; error: unknown }> = [];
  for (const d of due) {
    try {
      const account = await withBillingRead(d.organizationId, readAccountInTx);
      const ready = !!account.card || account.manualPayment;
      const res = await endSubscriptionTrial(d.organizationId, d.subscriptionId, ready);
      if (!res.ended) continue;
      ended++;
      if (res.dunningId) readOnly++;
      if (account.card) {
        await reconcileSubscription(d.organizationId).catch((err) =>
          reportBillingError('trial.stripe-reconcile', err, { organizationId: d.organizationId }),
        );
      }
    } catch (error) {
      errors.push({ organizationId: d.organizationId, error });
    }
  }
  return { ended, readOnly, errors };
}

// ── the payment of an implementation (S121) ─────────────────────────────────────────────────

async function setupRequestOf(
  organizationId: string,
  setupRequestId: string,
): Promise<SetupRequestRow> {
  const all = await listSetupRequests(organizationId);
  const r = all.find((x) => x.id === setupRequestId);
  if (!r) throw new ResourceNotFound('Request not found');
  return r;
}

/**
 * HubSetupRequest „Plătește implementarea”: the owner pays the confirmed implementation with the
 * saved card (a PaymentIntent on session, 3-D Secure in the dialog → `confirmPurchase`). The
 * payment → the request `paid` (activateIfPaid), its invoice with the line „Implementare …”.
 * A business on transfer gets the invoice instead (`createSetupTransferInvoice`).
 */
export async function paySetupRequest(
  ctx: BillingContext,
  setupRequestId: string,
): Promise<{ purchaseId: string; pi: PaymentIntentState | null }> {
  assertBuyer(ctx);
  const organizationId = ctx.organizationId;
  const req = await setupRequestOf(organizationId, uuid('setupRequestId', setupRequestId));
  if (req.status !== 'confirmed' || !req.setupMinor) throw new Conflict('setup_not_payable');
  const purchaseId = uuidv7();
  const account = await withBillingWrite(organizationId, async (client) => {
    const account = await readAccountInTx(client);
    if (account.manualPayment) throw new Conflict('manual_payment');
    if (!account.card || !account.customerId) throw new InvalidInput('card', 'No saved card');
    await client
      .query(
        `INSERT INTO billing.purchase
           (id, organization_id, kind, application_id, setup_request_id, item_name, packs, currency,
            price_minor, setup_minor, recurring, created_by_user_id)
         VALUES ($1, $2, 'setup', $3, $4, $5, 1, $6, 0, $7, false, $8)`,
        [
          purchaseId,
          organizationId,
          req.applicationId,
          req.id,
          `Implementare ${invoiceAppName(req.applicationId)}`.slice(0, 128),
          req.currency,
          req.setupMinor,
          ctx.userId,
        ],
      )
      .catch((err) => {
        if ((err as { code?: string }).code === '23505')
          throw new Conflict('setup_payment_in_progress');
        throw err;
      });
    return account;
  });
  const pi = await getStripeGateway().createPaymentIntent({
    customerId: account.customerId!,
    paymentMethodId: account.card!.paymentMethodId,
    amountMinor: req.setupMinor,
    currency: req.currency,
    description: `Ventora Systems · Implementare ${invoiceAppName(req.applicationId)}`,
    metadata: { organization_id: organizationId, purchase_id: purchaseId },
    idempotencyKey: `purchase-${purchaseId}`,
  });
  await withBillingWrite(organizationId, (client, exec) =>
    applyPaymentIntentInTx(client, exec, organizationId, pi),
  );
  return { purchaseId, pi };
}

/**
 * „Confirmă” for a business on transfer: the implementation's invoice, issued first with the due
 * date (the team confirms the receipt → the request `paid`). Idempotent on the request.
 */
export async function createSetupTransferInvoice(params: {
  founderHeaders: Headers;
  organizationId: string;
  setupRequestId: string;
}): Promise<{ invoiceId: string | null }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const req = await getSetupRequestForFounder(params);
  if (req.status !== 'confirmed' || !req.setupMinor) throw new Conflict('setup_not_payable');
  return withBillingFounder(organizationId, async (client, exec) => {
    const sub = await client.query<{ payment_method: string; payment_terms_days: number }>(
      `SELECT payment_method, payment_terms_days FROM billing.billing_subscription LIMIT 1`,
    );
    if (sub.rows[0]?.payment_method !== 'manual') return { invoiceId: null };
    const id = uuidv7();
    const lines: InvoiceLine[] = [
      {
        name: `Implementare ${invoiceAppName(req.applicationId)} · o singură dată`,
        code: 'VNT-SETUP',
        quantity: 1,
        unitMinor: req.setupMinor!,
      },
    ];
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO billing.invoice
         (id, organization_id, kind, collection, provider, amount_minor, currency, due_on,
          setup_request_id, lines)
       VALUES ($1, $2, 'invoice', 'transfer', $3, $4, $5, $6::date, $7, $8::jsonb)
       ON CONFLICT (setup_request_id) WHERE kind = 'invoice' AND setup_request_id IS NOT NULL
         DO NOTHING
       RETURNING id`,
      [
        id,
        organizationId,
        getInvoiceProvider().name,
        req.setupMinor,
        req.currency,
        addDays(romanianDate(new Date()), sub.rows[0].payment_terms_days),
        req.id,
        JSON.stringify(lines),
      ],
    );
    if (!rows[0]) return { invoiceId: null };
    await auditTransferInvoiced(
      exec,
      organizationId,
      id,
      { setupRequestId: req.id, amountMinor: req.setupMinor },
      founder.userId,
    );
    return { invoiceId: id };
  });
}

/**
 * „Anulează și rambursează…” (after the payment, until live): the card → the whole payment back
 * through Stripe (the storno follows from `charge.refunded`); the transfer → the storno of its
 * invoice now (the money is sent back by the team). Then the request `refunded`, with the reason.
 */
export async function refundSetupRequest(params: {
  founderHeaders: Headers;
  organizationId: string;
  setupRequestId: string;
  reason: string;
}): Promise<SetupRequestRow> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  const req = await getSetupRequestForFounder(params);
  if (req.status !== 'paid' && req.status !== 'in_progress')
    throw new Conflict('setup_not_refundable');
  const reason = params.reason?.trim() ?? '';
  if (!reason) throw new InvalidInput('reason');
  let refundRef: string;
  if (req.paymentMethod === 'card') {
    const pi = await withBillingFounder(
      organizationId,
      async (client) => {
        const { rows } = await client.query<{ stripe_payment_intent_id: string | null }>(
          `SELECT stripe_payment_intent_id FROM billing.purchase
            WHERE setup_request_id = $1 AND status IN ('paid', 'succeeded') LIMIT 1`,
          [req.id],
        );
        return rows[0]?.stripe_payment_intent_id ?? null;
      },
      { readOnly: true },
    );
    if (!pi) throw new Conflict('setup_payment_missing');
    refundRef = (await getStripeGateway().refundPaymentIntent(pi, `setup-refund-${req.id}`)).id;
  } else {
    refundRef = await withBillingWrite(organizationId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO billing.invoice
           (id, organization_id, kind, payment_id, reverses_invoice_id, provider, amount_minor, currency)
         SELECT $1, i.organization_id, 'storno', i.payment_id, i.id, i.provider, i.amount_minor, i.currency
           FROM billing.invoice i
          WHERE i.id = $2 AND i.kind = 'invoice'
         ON CONFLICT (reverses_invoice_id) DO NOTHING
         RETURNING id`,
        [uuidv7(), req.paymentRef],
      );
      if (rows[0]) return rows[0].id;
      const found = await client.query<{ id: string }>(
        `SELECT id FROM billing.invoice WHERE reverses_invoice_id = $1`,
        [req.paymentRef],
      );
      if (!found.rows[0]) throw new Conflict('setup_invoice_missing');
      return found.rows[0].id;
    });
  }
  return refundSetupByFounder({ ...params, reason, refundRef });
}

/** The saved card's last 4 digits, for the refund line („pe cardul ···· 4242”); null: none. */
export async function getSavedCardLast4ForFounder(params: {
  founderHeaders: Headers;
  organizationId: string;
}): Promise<string | null> {
  await requireFounderSession(params.founderHeaders);
  const organizationId = uuid('organizationId', params.organizationId);
  return withBillingFounder(
    organizationId,
    async (client) => {
      const { rows } = await client.query<{ last4: string }>(
        `SELECT last4 FROM billing.payment_method_ref WHERE is_default AND detached_at IS NULL LIMIT 1`,
      );
      return rows[0]?.last4 ?? null;
    },
    { readOnly: true },
  );
}
