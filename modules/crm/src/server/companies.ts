import type { PoolClient } from 'pg';
import { getMemberApplicationAccess, type TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx, type AuditSqlExecutor } from '@ventora/audit';
import {
  CrmCompanyCreatedV1,
  CrmCompanyDeletedV1,
  CrmCompanyRestoredV1,
  CrmCompanyUpdatedV1,
} from '@ventora/contracts';
import { uuidv7, writeOutboxEvent } from '@ventora/db-kit';
import { Conflict, Forbidden, InvalidInput, ResourceNotFound } from '@ventora/errors';
import { withCrmTx } from './db';
import {
  LIMITS,
  likePattern,
  normalizeEmail,
  normalizePhone,
  normalizeTaxId,
  normalizeWebsite,
  optionalText,
  page,
  requireId,
  requiredText,
} from './validation';
import type { ContactScope } from './contacts';

/*
 * Lot CR.2 — the companies of ClientDesk (design S130, ClientDeskCompanies). Every member with
 * crm:read sees the companies (D-CRM-15 limits the contacts, leads and deals, not the companies);
 * the people of a company shown to a member follow the contacts rule. A company goes to the
 * 30-day bin only without active people (Conflict company_has_contacts: take them out first).
 * One active company per CUI in a business (Conflict company_tax_id_taken).
 */

export type Company = {
  id: string;
  name: string;
  taxId: string | null;
  industry: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  ownerUserId: string | null;
  /** The active people of the company. */
  contactsCount: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyInput = {
  name?: unknown;
  taxId?: unknown;
  industry?: unknown;
  address?: unknown;
  website?: unknown;
  phone?: unknown;
  email?: unknown;
};

type CompanyRow = {
  id: string;
  name: string;
  tax_id: string | null;
  industry: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  owner_user_id: string | null;
  contacts_count: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `c.id, c.name, c.tax_id, c.industry, c.address, c.website, c.phone, c.email,
  c.owner_user_id, c.deleted_at, c.created_at, c.updated_at,
  (SELECT count(*) FROM crm.contact p WHERE p.company_id = c.id AND p.deleted_at IS NULL) AS contacts_count`;

function toCompany(r: CompanyRow): Company {
  return {
    id: r.id,
    name: r.name,
    taxId: r.tax_id,
    industry: r.industry,
    address: r.address,
    website: r.website,
    phone: r.phone,
    email: r.email,
    ownerUserId: r.owner_user_id,
    contactsCount: Number(r.contacts_count),
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function audit(
  exec: AuditSqlExecutor,
  ctx: TenantContext,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  return appendAuditEventInTx(exec, {
    category: 'crm',
    action,
    outcome: 'success',
    actorType: 'user',
    actorId: ctx.userId,
    organizationId: ctx.organizationId,
    targetType: 'crm_company',
    targetId,
    metadata,
  });
}

function emit<T>(
  client: PoolClient,
  ctx: TenantContext,
  def: Parameters<typeof writeOutboxEvent>[2],
  id: string,
  payload: T,
) {
  return writeOutboxEvent(client, 'crm', def, {
    organizationId: ctx.organizationId,
    sourceApp: 'platform',
    resourceId: id,
    payload,
  });
}

async function readCompany(client: PoolClient, id: string, lock = false): Promise<CompanyRow> {
  const { rows } = await client.query<CompanyRow>(
    `SELECT ${COLUMNS} FROM crm.company c WHERE c.id = $1${lock ? ' FOR UPDATE OF c' : ''}`,
    [id],
  );
  if (!rows[0]) throw new ResourceNotFound();
  return rows[0];
}

function mapTaxId(err: unknown): never {
  if (
    (err as { code?: string }).code === '23505' &&
    String((err as { constraint?: string }).constraint) === 'company_active_tax_id_key'
  ) {
    throw new Conflict('company_tax_id_taken');
  }
  throw err;
}

function details(input: CompanyInput) {
  return {
    taxId: normalizeTaxId(input.taxId),
    industry: optionalText('industry', input.industry, LIMITS.industry),
    address: optionalText('address', input.address, LIMITS.address),
    website: normalizeWebsite(input.website),
    phone: normalizePhone('phone', input.phone),
    email: normalizeEmail('email', input.email),
  };
}

async function ownerFor(ctx: TenantContext, scope: ContactScope, value: unknown) {
  if (value === undefined) return ctx.userId;
  if (value === null) return null;
  const owner = requireId('ownerUserId', value);
  if (scope === 'own' && owner !== ctx.userId) throw new Forbidden();
  if (owner !== ctx.userId) {
    const access = await getMemberApplicationAccess(ctx, owner, 'crm');
    if (access.status !== 'active' || !access.hasAccess) {
      throw new InvalidInput('ownerUserId', 'not_member');
    }
  }
  return owner;
}

export async function createCompanyInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  input: CompanyInput & { ownerUserId?: unknown },
): Promise<Company> {
  const name = requiredText('name', input.name, LIMITS.companyName);
  const d = details(input);
  const owner = await ownerFor(ctx, scope, input.ownerUserId);
  const id = uuidv7();
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    await client
      .query(
        `INSERT INTO crm.company
           (id, organization_id, name, tax_id, industry, address, website, phone, email,
            owner_user_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          ctx.organizationId,
          name,
          d.taxId ?? null,
          d.industry ?? null,
          d.address ?? null,
          d.website ?? null,
          d.phone ?? null,
          d.email ?? null,
          owner,
          ctx.userId,
        ],
      )
      .catch(mapTaxId);
    await audit(exec, ctx, AuditActions.crmCompanyCreated, id, { ownerUserId: owner });
    await emit(client, ctx, CrmCompanyCreatedV1, id, { companyId: id, ownerUserId: owner });
    return toCompany(await readCompany(client, id));
  });
}

export async function updateCompanyInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  companyId: string,
  input: CompanyInput & { ownerUserId?: unknown },
): Promise<Company> {
  const id = requireId('companyId', companyId);
  const name =
    input.name === undefined ? undefined : requiredText('name', input.name, LIMITS.companyName);
  const d = details(input);
  const owner =
    input.ownerUserId === undefined ? undefined : await ownerFor(ctx, scope, input.ownerUserId);
  const patch: Record<string, unknown> = {
    name,
    tax_id: d.taxId,
    industry: d.industry,
    address: d.address,
    website: d.website,
    phone: d.phone,
    email: d.email,
    owner_user_id: owner,
  };
  const fields = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (fields.length === 0) throw new InvalidInput('company', 'required');
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readCompany(client, id, true);
    if (before.deleted_at) throw new Conflict('company_deleted');
    await client
      .query(
        `UPDATE crm.company SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [id, ...fields.map((f) => patch[f])],
      )
      .catch(mapTaxId);
    await audit(exec, ctx, AuditActions.crmCompanyUpdated, id, { fields });
    await emit(client, ctx, CrmCompanyUpdatedV1, id, { companyId: id, fields });
    return toCompany(await readCompany(client, id));
  });
}

/** Into the 30-day bin, only without active people (take them out of the company first). */
export async function deleteCompanyInOrg(ctx: TenantContext, companyId: string): Promise<Company> {
  const id = requireId('companyId', companyId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readCompany(client, id, true);
    if (before.deleted_at) throw new Conflict('company_deleted');
    if (Number(before.contacts_count) > 0) throw new Conflict('company_has_contacts');
    await client.query(
      `UPDATE crm.company SET deleted_at = now(), deleted_by_user_id = $2 WHERE id = $1`,
      [id, ctx.userId],
    );
    await audit(exec, ctx, AuditActions.crmCompanyDeleted, id, {});
    await emit(client, ctx, CrmCompanyDeletedV1, id, { companyId: id });
    return toCompany(await readCompany(client, id));
  });
}

/** Back from the bin, within 30 days; its CUI must still be free. */
export async function restoreCompanyInOrg(ctx: TenantContext, companyId: string): Promise<Company> {
  const id = requireId('companyId', companyId);
  return withCrmTx(ctx.organizationId, async (client, exec) => {
    const before = await readCompany(client, id, true);
    if (!before.deleted_at) throw new Conflict('company_not_deleted');
    if (Date.now() - before.deleted_at.getTime() > LIMITS.binDays * 86_400_000) {
      throw new Conflict('bin_expired');
    }
    await client
      .query(`UPDATE crm.company SET deleted_at = NULL, deleted_by_user_id = NULL WHERE id = $1`, [
        id,
      ])
      .catch(mapTaxId);
    await audit(exec, ctx, AuditActions.crmCompanyRestored, id, {});
    await emit(client, ctx, CrmCompanyRestoredV1, id, { companyId: id });
    return toCompany(await readCompany(client, id));
  });
}

export async function getCompanyInOrg(ctx: TenantContext, companyId: string): Promise<Company> {
  const id = requireId('companyId', companyId);
  return toCompany(await withCrmTx(ctx.organizationId, (client) => readCompany(client, id), true));
}

export async function listCompaniesInOrg(
  ctx: TenantContext,
  params: { q?: unknown; deleted?: unknown; limit?: unknown; offset?: unknown },
): Promise<{ items: Company[]; total: number }> {
  const { limit, offset } = page(params);
  const where: string[] = [
    params.deleted === true ? 'c.deleted_at IS NOT NULL' : 'c.deleted_at IS NULL',
  ];
  const args: unknown[] = [];
  if (params.q !== undefined && params.q !== null && params.q !== '') {
    if (typeof params.q !== 'string' || params.q.length > 100)
      throw new InvalidInput('q', 'invalid');
    const q = params.q.trim();
    if (q) {
      args.push(likePattern(q.toLowerCase()));
      args.push(likePattern(q.replace(/\s+/g, '').toUpperCase()));
      where.push(`(lower(c.name) LIKE $1 OR c.tax_id LIKE $2)`);
    }
  }
  const sql = where.join(' AND ');
  return withCrmTx(
    ctx.organizationId,
    async (client) => {
      const total = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM crm.company c WHERE ${sql}`,
        args,
      );
      const { rows } = await client.query<CompanyRow>(
        `SELECT ${COLUMNS} FROM crm.company c WHERE ${sql}
          ORDER BY lower(c.name), c.id LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        [...args, limit, offset],
      );
      return { items: rows.map(toCompany), total: Number(total.rows[0]?.n ?? 0) };
    },
    true,
  );
}
