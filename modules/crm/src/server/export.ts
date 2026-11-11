import type { TenantContext } from '@ventora/access';
import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import { uuidv7 } from '@ventora/db-kit';
import { InvalidInput } from '@ventora/errors';
import { listActivitiesInOrg, type ListActivitiesParams } from './activities';
import { listCompaniesInOrg } from './companies';
import { listContactsInOrg, type ContactScope, type ListContactsParams } from './contacts';
import { listDealsInOrg, type ListDealsParams } from './deals';
import { withCrmTx } from './db';
import { listLeadsInOrg, type ListLeadsParams } from './leads';

/*
 * Lot CR.11a — the export of ClientDesk (plans/CRM.md CR.11; design S132): contacts, companies,
 * leads, deals, activities as CSV, with the list's filters (the segment included). Only crm:export
 * (the contract); only what the person sees (D-CRM-15). At most 10 000 rows per file.
 *
 * - UTF-8 with a BOM (Excel opens Romanian letters right), comma-separated, RFC 4180 quoting.
 * - A cell starting with = + - @ (or a tab / CR) gets a leading apostrophe: no formula runs when the
 *   file is opened (CSV injection).
 * - The header is the stable column keys; the screen names them in the person's language.
 * - Audited (crm.exported): what, how many rows, which filters were set — never the data.
 * - Excel (.xlsx) needs the exceljs package (D-CRM-7): a proposal, not added.
 */

export const EXPORT_ENTITIES = ['contacts', 'companies', 'leads', 'deals', 'activities'] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export const EXPORT_MAX_ROWS = 10_000;
const PAGE = 100;

/** One CSV cell: quoted when needed, formulas neutralised. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s =
    value instanceof Date
      ? value.toISOString()
      : Array.isArray(value)
        ? value.join(';')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: readonly string[], rows: Record<string, unknown>[]): string {
  const lines = [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}

const COLUMNS: Record<ExportEntity, readonly string[]> = {
  contacts: [
    'id',
    'name',
    'phone',
    'phoneAlt',
    'email',
    'emailAlt',
    'locale',
    'birthday',
    'address',
    'source',
    'companyId',
    'companyRole',
    'ownerUserId',
    'tagIds',
    'createdAt',
  ],
  companies: [
    'id',
    'name',
    'taxId',
    'industry',
    'address',
    'website',
    'phone',
    'email',
    'ownerUserId',
    'contactsCount',
    'createdAt',
  ],
  leads: [
    'id',
    'name',
    'phone',
    'email',
    'source',
    'referredBy',
    'budgetMinor',
    'currency',
    'eventDate',
    'ownerUserId',
    'state',
    'disqualifyReason',
    'convertedContactId',
    'createdAt',
  ],
  deals: [
    'id',
    'title',
    'pipelineId',
    'stageId',
    'contactId',
    'companyId',
    'currency',
    'valueMinor',
    'probability',
    'expectedCloseOn',
    'ownerUserId',
    'status',
    'wonValueMinor',
    'closedOn',
    'lossReasonId',
    'createdAt',
  ],
  activities: [
    'id',
    'kind',
    'title',
    'priority',
    'subjectType',
    'subjectId',
    'ownerUserId',
    'dueOn',
    'dueAt',
    'durationMinutes',
    'callResult',
    'meetingPlace',
    'status',
    'doneAt',
    'createdAt',
  ],
};

/** Every page of a list, up to the cap (more: the person narrows the filters). */
async function collect<T>(fetch: (offset: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await fetch(offset);
    out.push(...batch);
    if (out.length > EXPORT_MAX_ROWS) throw new InvalidInput('filters', 'too_many_rows');
    if (batch.length < PAGE) return out;
  }
}

export type ExportParams = {
  entity?: unknown;
  /** The list's own filters (as listContacts, listLeads, listDeals, listActivities). */
  filters?: Record<string, unknown>;
};

export async function exportCsvInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: ExportParams,
): Promise<{ fileName: string; contentType: string; rows: number; csv: string }> {
  if (!(EXPORT_ENTITIES as readonly unknown[]).includes(params.entity)) {
    throw new InvalidInput('entity', 'invalid');
  }
  const entity = params.entity as ExportEntity;
  if (
    params.filters !== undefined &&
    (params.filters === null || typeof params.filters !== 'object' || Array.isArray(params.filters))
  ) {
    throw new InvalidInput('filters', 'invalid');
  }
  const filters: Record<string, unknown> = { ...(params.filters ?? {}) };
  delete filters.limit;
  delete filters.offset;

  let rows: Record<string, unknown>[];
  switch (entity) {
    case 'contacts':
      rows = await collect(
        async (offset) =>
          (
            await listContactsInOrg(ctx, scope, {
              ...(filters as ListContactsParams),
              limit: PAGE,
              offset,
            })
          ).items,
      );
      break;
    case 'companies':
      rows = await collect(
        async (offset) =>
          (await listCompaniesInOrg(ctx, { ...filters, limit: PAGE, offset })).items,
      );
      break;
    case 'leads':
      rows = await collect((offset) =>
        listLeadsInOrg(ctx, scope, { ...(filters as ListLeadsParams), limit: PAGE, offset }),
      );
      break;
    case 'deals':
      rows = await collect((offset) =>
        listDealsInOrg(ctx, scope, {
          status: 'all',
          ...(filters as ListDealsParams),
          limit: PAGE,
          offset,
        }),
      );
      break;
    case 'activities':
      rows = await collect((offset) =>
        listActivitiesInOrg(ctx, scope, {
          who: 'team',
          status: 'all',
          ...(filters as ListActivitiesParams),
          limit: PAGE,
          offset,
        }),
      );
      break;
  }

  const csv = toCsv(COLUMNS[entity], rows);
  await withCrmTx(ctx.organizationId, (_client, exec) =>
    appendAuditEventInTx(exec, {
      category: 'crm',
      action: AuditActions.crmExported,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'crm_export',
      targetId: uuidv7(),
      metadata: { entity, rows: rows.length, format: 'csv', filters: Object.keys(filters).sort() },
    }),
  );
  const day = new Date().toISOString().slice(0, 10);
  return {
    fileName: `clientdesk-${entity}-${day}.csv`,
    contentType: 'text/csv; charset=utf-8',
    rows: rows.length,
    csv,
  };
}
