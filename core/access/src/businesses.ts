import crypto from 'node:crypto';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import {
  AuditActions,
  appendAuditEventInTx,
  readAuditLogAsFounder,
  type AuditLogEntry,
} from '@ventora/audit';
import { getUserContactInTx, requireFounderSession } from '@ventora/identity';
import {
  createOrganizationAsFounder,
  listOrganizationsAsFounderInTx,
  setOrganizationStatusInTx,
  type FounderOrganizationRow,
} from '@ventora/organizations';
import { withFounderTransaction } from './founder-db';

/* Lot 2.8: afacerile în Founder (FounderBusinesses, FounderBusiness), fără partea comercială.
   Totul trece prin founder_runtime și funcțiile SECURITY DEFINER din organizations; Founder nu
   devine membru al vreunei afaceri și nu vede datele ei (doar prin sesiunea de suport). */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECENT_CHANGES = 5;

/** „Ultimele modificări”: ce s-a schimbat la afacere (nu citirile jurnalului, nu cererile). */
export const BUSINESS_CHANGE_ACTIONS = [
  AuditActions.organizationCreated,
  AuditActions.organizationSuspended,
  AuditActions.organizationReactivated,
  AuditActions.invitationCreated,
  AuditActions.invitationResent,
  AuditActions.invitationRevoked,
  AuditActions.invitationAccepted,
  AuditActions.applicationAccessGranted,
  AuditActions.supportSessionOpened,
  AuditActions.supportSessionClosed,
  AuditActions.supportSessionRevokedByOrg,
  AuditActions.ownerRecoveryPerformed,
] as const;

export type FounderBusiness = {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  createdAt: Date;
  suspendedAt: Date | null;
  /** The first active owner; null while the owner has not accepted the invitation yet. */
  owner: { userId: string; name: string; email: string } | null;
  /** Without an owner: the newest owner invitation (pending / expired / revoked). */
  ownerInvitation: { email: string; state: string } | null;
  /** Active people in the business (the suspension dialog). */
  memberCount: number;
};

async function withOwners(
  exec: Parameters<Parameters<typeof withFounderTransaction>[0]>[0],
  rows: FounderOrganizationRow[],
): Promise<FounderBusiness[]> {
  const out: FounderBusiness[] = [];
  for (const r of rows) {
    const contact = r.ownerUserId ? await getUserContactInTx(exec, r.ownerUserId) : null;
    out.push({
      id: r.organizationId,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt,
      suspendedAt: r.suspendedAt,
      owner: r.ownerUserId && contact ? { userId: r.ownerUserId, ...contact } : null,
      ownerInvitation: r.ownerInvitation,
      memberCount: r.memberCount,
    });
  }
  return out;
}

/** FounderBusinesses: every business, with its owner (or the owner's invitation) and status. */
export async function listBusinessesForFounder(params: {
  founderHeaders: Headers;
}): Promise<FounderBusiness[]> {
  await requireFounderSession(params.founderHeaders);
  return withFounderTransaction(async (exec) =>
    withOwners(exec, await listOrganizationsAsFounderInTx(exec)),
  );
}

/**
 * FounderBusiness: one business and its latest changes from the audit log. Reading the log as
 * Founder is itself audited (E33, readAuditLogAsFounder).
 */
export async function getBusinessPageForFounder(params: {
  founderHeaders: Headers;
  organizationId: string;
}): Promise<{ business: FounderBusiness; recent: AuditLogEntry[] }> {
  const founder = await requireFounderSession(params.founderHeaders);
  if (!UUID_RE.test(params.organizationId)) throw new ResourceNotFound('Organization not found');
  const business = await withFounderTransaction(async (exec) => {
    const rows = await listOrganizationsAsFounderInTx(exec);
    const row = rows.find((r) => r.organizationId === params.organizationId);
    return row ? (await withOwners(exec, [row]))[0]! : null;
  });
  if (!business) throw new ResourceNotFound('Organization not found');
  const recent = await readAuditLogAsFounder(founder.userId, {
    organizationId: params.organizationId,
    actions: [...BUSINESS_CHANGE_ACTIONS],
    limit: RECENT_CHANGES,
  });
  return { business, recent };
}

/**
 * D3-20 (varianta a): suspends a business. Nobody in it gets past authorize() from the next
 * request on, not even to read; the data stays; support sessions still work. The Founder confirms
 * by typing the business name (FounderStates); the status change and its audit row are one
 * transaction (required).
 */
export async function suspendBusiness(params: {
  founderHeaders: Headers;
  organizationId: string;
  confirmName: string;
}): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  if (!UUID_RE.test(params.organizationId)) throw new ResourceNotFound('Organization not found');
  await withFounderTransaction(async (exec) => {
    const rows = await listOrganizationsAsFounderInTx(exec);
    const row = rows.find((r) => r.organizationId === params.organizationId);
    if (!row) throw new ResourceNotFound('Organization not found');
    if ((params.confirmName ?? '').trim() !== row.name.trim())
      throw new InvalidInput('confirmName');
    const result = await setOrganizationStatusInTx(
      exec,
      params.organizationId,
      'suspended',
      founder.userId,
    );
    if (!result) throw new ResourceNotFound('Organization not found');
    if (!result.changed) return;
    await appendAuditEventInTx(exec, {
      category: 'organization',
      action: AuditActions.organizationSuspended,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId: params.organizationId,
      targetType: 'organization',
      targetId: params.organizationId,
    });
  });
}

/** Reactivates a suspended business; access comes back with the data untouched. Audited. */
export async function reactivateBusiness(params: {
  founderHeaders: Headers;
  organizationId: string;
}): Promise<void> {
  const founder = await requireFounderSession(params.founderHeaders);
  if (!UUID_RE.test(params.organizationId)) throw new ResourceNotFound('Organization not found');
  await withFounderTransaction(async (exec) => {
    const result = await setOrganizationStatusInTx(
      exec,
      params.organizationId,
      'active',
      founder.userId,
    );
    if (!result) throw new ResourceNotFound('Organization not found');
    if (!result.changed) return;
    await appendAuditEventInTx(exec, {
      category: 'organization',
      action: AuditActions.organizationReactivated,
      outcome: 'success',
      actorType: 'founder',
      actorId: founder.userId,
      founderId: founder.userId,
      organizationId: params.organizationId,
      targetType: 'organization',
      targetId: params.organizationId,
    });
  });
}

/** „Salon Aurora” → „salon-aurora”: litere și cifre fără diacritice, cratimă între cuvinte. */
export function slugFromName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : `afacere-${base}`.replace(/-+$/g, '');
}

function isSlugTaken(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code === 'RESERVED_SLUG') return true;
  return e?.code === '23505' && /slug/i.test(`${e.constraint ?? ''} ${e.message ?? ''}`);
}

/**
 * „Afacere nouă” (FounderNewBusiness, fără partea comercială): the business and its owner's
 * invitation in one step, through createOrganizationAsFounder (E20 audit row in the same
 * transaction, E-4 to the owner). The slug comes from the name; a taken one gets a short suffix.
 */
export async function createBusinessAsFounder(params: {
  founderHeaders: Headers;
  name: string;
  ownerEmail: string;
}): Promise<{ organizationId: string }> {
  const founder = await requireFounderSession(params.founderHeaders);
  const name = (params.name ?? '').trim();
  if (!name || name.length > 255) throw new InvalidInput('name');
  const ownerEmail = (params.ownerEmail ?? '').trim();
  if (!EMAIL_RE.test(ownerEmail)) throw new InvalidInput('ownerEmail');
  const base = slugFromName(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0 ? base : `${base.slice(0, 44)}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      const created = await createOrganizationAsFounder(
        { founderId: founder.userId },
        { name, slug, ownerEmail },
      );
      return { organizationId: created.organizationId };
    } catch (err) {
      if (!isSlugTaken(err)) throw err;
    }
  }
  throw new InvalidInput('name', 'No free slug for this name');
}
