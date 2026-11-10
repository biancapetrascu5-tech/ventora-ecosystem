import { authorize, checkRolePermission, type TenantContext } from '@ventora/access';
import {
  assignContactInOrg,
  createContactInOrg,
  deleteContactInOrg,
  getContactInOrg,
  listContactsInOrg,
  restoreContactInOrg,
  setContactCompanyInOrg,
  updateContactInOrg,
  type Contact,
  type ContactInput,
  type ContactScope,
  type ListContactsParams,
} from '../server/contacts';
import {
  createCompanyInOrg,
  deleteCompanyInOrg,
  getCompanyInOrg,
  listCompaniesInOrg,
  restoreCompanyInOrg,
  updateCompanyInOrg,
  type Company,
  type CompanyInput,
} from '../server/companies';
import { lookupCompanyByCui as lookup, type AnafLookup } from '../server/anaf';
import { registerContactsQuotaResolver } from '../server/quota';

/*
 * Lot CR.2 — the public contract of the contacts and the companies (design S130). Every function
 * starts with authorize() (application crm): reading with crm:read, writing with crm:write. The
 * organization comes only from the session; an id of another business answers ResourceNotFound
 * (T1). Who sees what (D-CRM-15 = a): with crm:admin every contact, otherwise the own and the
 * unassigned ones (scope 'own').
 *
 * Errors: InvalidInput(field, reason); Conflict (contact_deleted, contact_not_deleted,
 * easybook_read_only, easybook_contact, bin_expired, company_deleted, company_not_deleted,
 * company_has_contacts, company_tax_id_taken); Forbidden; ResourceNotFound; QuotaExceeded
 * (crm.contacts); AppNotEnabled.
 */

registerContactsQuotaResolver();

type Session = { sessionToken: string };

async function access(
  params: Session,
  permission: 'crm:read' | 'crm:write',
): Promise<{ ctx: TenantContext; scope: ContactScope }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'crm',
    permission,
  });
  const all = ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'crm', 'crm:admin'));
  return { ctx, scope: all ? 'all' : 'own' };
}

export type CreateContactParams = Session &
  ContactInput & {
    /** 'manual' (default), 'referral' or 'event'. */
    source?: unknown;
    /** The creator by default; null = „Neatribuit”. A member: only themselves or nobody. */
    ownerUserId?: unknown;
    companyId?: unknown;
    companyRole?: unknown;
    isCompanyPrimary?: unknown;
  };

/** „Contact nou”: takes one unit of crm.contacts (QuotaExceeded at the limit, S130). */
export async function createContact(params: CreateContactParams): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createContactInOrg(ctx, scope, params);
}

export async function updateContact(
  params: Session & ContactInput & { contactId: string },
): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateContactInOrg(ctx, scope, params.contactId, params);
}

/** „Responsabil” / „Ia contactul” (a member takes an unassigned contact). */
export async function assignContact(
  params: Session & { contactId: string; ownerUserId: string | null },
): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return assignContactInOrg(ctx, scope, params.contactId, params.ownerUserId);
}

/** The company of the contact (one per contact, S130); null takes it out. */
export async function setContactCompany(
  params: Session & {
    contactId: string;
    companyId: string | null;
    companyRole?: unknown;
    isCompanyPrimary?: unknown;
  },
): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return setContactCompanyInOrg(ctx, scope, params.contactId, params);
}

/** „Șterge”: into the 30-day bin (never a contact from EasyBook). */
export async function deleteContact(params: Session & { contactId: string }): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteContactInOrg(ctx, scope, params.contactId);
}

export async function restoreContact(params: Session & { contactId: string }): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return restoreContactInOrg(ctx, scope, params.contactId);
}

export async function getContact(params: Session & { contactId: string }): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getContactInOrg(ctx, scope, params.contactId);
}

export async function listContacts(
  params: Session & ListContactsParams,
): Promise<{ items: Contact[]; total: number }> {
  const { ctx, scope } = await access(params, 'crm:read');
  return listContactsInOrg(ctx, scope, params);
}

// ── companies ──────────────────────────────────────────────────────────────────────────────────

export async function createCompany(
  params: Session & CompanyInput & { ownerUserId?: unknown },
): Promise<Company> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createCompanyInOrg(ctx, scope, params);
}

export async function updateCompany(
  params: Session & CompanyInput & { companyId: string; ownerUserId?: unknown },
): Promise<Company> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateCompanyInOrg(ctx, scope, params.companyId, params);
}

export async function deleteCompany(params: Session & { companyId: string }): Promise<Company> {
  const { ctx } = await access(params, 'crm:write');
  return deleteCompanyInOrg(ctx, params.companyId);
}

export async function restoreCompany(params: Session & { companyId: string }): Promise<Company> {
  const { ctx } = await access(params, 'crm:write');
  return restoreCompanyInOrg(ctx, params.companyId);
}

export async function getCompany(params: Session & { companyId: string }): Promise<Company> {
  const { ctx } = await access(params, 'crm:read');
  return getCompanyInOrg(ctx, params.companyId);
}

export async function listCompanies(
  params: Session & { q?: unknown; deleted?: unknown; limit?: unknown; offset?: unknown },
): Promise<{ items: Company[]; total: number }> {
  const { ctx } = await access(params, 'crm:read');
  return listCompaniesInOrg(ctx, params);
}

/** „Completează din CUI” (ANAF, S130): fills the form; nothing is stored. */
export async function lookupCompanyByCui(params: Session & { taxId: string }): Promise<AnafLookup> {
  await access(params, 'crm:write');
  return lookup(params.taxId);
}

export type { Contact, Company, AnafLookup, ListContactsParams };
