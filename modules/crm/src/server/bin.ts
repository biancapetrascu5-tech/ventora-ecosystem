import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import { deleteOwnerFilesAsSystem } from '@ventora/files';
import { withCrmModuleTx, withCrmTx } from './db';

/*
 * The 30-day bin (decision of 11.11.2026): a contact deleted more than 30 days ago is anonymised,
 * as booking.erase_client, never deleted (no DELETE grant). The job lists the due contacts of
 * every business through crm.bin_expired_contacts (ids only), then anonymises each one in its own
 * business's context, as crm_rw: the contact, its notes and comments, its activities, the leads
 * converted into it. Restoring stops at 30 days already (`bin_expired`). One that fails does not
 * stop the others; the job reports it.
 *
 * The files of the contact and of the leads converted into it go first, through core/files (C.4f:
 * deleted, bytes out of the storage, audited there): a failure leaves the contact for the next
 * run. The audit rows stay (they hold no personal data).
 */

export type BinJobReport = {
  anonymized: number;
  failed: { contactId: string; organizationId: string; error: unknown }[];
};

const MARK = '—';

/** The files of the contact and of its converted leads (C.4f); how many were deleted. */
async function deleteFiles(organizationId: string, contactId: string): Promise<number> {
  const leadIds = await withCrmTx(
    organizationId,
    async (client) =>
      (
        await client.query<{ id: string }>(
          `SELECT id::text FROM crm.lead WHERE converted_contact_id = $1`,
          [contactId],
        )
      ).rows.map((r) => r.id),
    true,
  );
  let deleted = 0;
  for (const [resourceType, resourceId] of [
    ['contact', contactId],
    ...leadIds.map((id) => ['lead', id] as const),
  ] as const) {
    deleted += await deleteOwnerFilesAsSystem(
      organizationId,
      { module: 'crm', resourceType, resourceId },
      'crm_contact_anonymized',
    );
  }
  return deleted;
}

/** Anonymises one due contact in its business (nothing if restored or done meanwhile). */
async function anonymize(
  organizationId: string,
  contactId: string,
  files: number,
): Promise<boolean> {
  return withCrmTx(organizationId, async (client, exec) => {
    const { rows } = await client.query<{ deleted_at: Date | null; anonymized_at: Date | null }>(
      `SELECT deleted_at, anonymized_at FROM crm.contact WHERE id = $1 FOR UPDATE`,
      [contactId],
    );
    const row = rows[0];
    if (!row || row.anonymized_at || !row.deleted_at) return false;
    if (Date.now() - row.deleted_at.getTime() <= 30 * 86_400_000) return false;
    await client.query(
      `UPDATE crm.contact
          SET name = $2, phone = NULL, phone_alt = NULL, email = NULL, email_alt = NULL,
              birthday = NULL, address = NULL, note = NULL, company_role = NULL,
              custom_values = '{}'::jsonb, tag_ids = '{}', anonymized_at = now()
        WHERE id = $1`,
      [contactId, MARK],
    );
    // the contact's history, and the history of the contacts merged into it, and of its leads
    const { rows: leads } = await client.query<{ id: string }>(
      `UPDATE crm.lead
          SET name = $2, phone = NULL, email = NULL, request = NULL, referred_by = NULL
        WHERE converted_contact_id = $1
        RETURNING id`,
      [contactId, MARK],
    );
    const leadIds = leads.map((l) => l.id);
    const notes = await client.query(
      `UPDATE crm.note SET body = $3, mentions = '{}'
        WHERE (subject_type = 'contact' AND subject_id = $1)
           OR (subject_type = 'lead' AND subject_id = ANY($2::uuid[]))`,
      [contactId, leadIds, MARK],
    );
    const activities = await client.query(
      `UPDATE crm.activity SET title = $3, note = NULL, outcome = NULL
        WHERE (subject_type = 'contact' AND subject_id = $1)
           OR (subject_type = 'lead' AND subject_id = ANY($2::uuid[]))`,
      [contactId, leadIds, MARK],
    );
    await appendAuditEventInTx(exec, {
      category: 'crm',
      action: AuditActions.crmContactAnonymized,
      outcome: 'success',
      actorType: 'system',
      organizationId,
      targetType: 'crm_contact',
      targetId: contactId,
      metadata: {
        leads: leadIds.length,
        notes: notes.rowCount ?? 0,
        activities: activities.rowCount ?? 0,
        files,
      },
    });
    return true;
  });
}

/** One run: at most `limit` due contacts (100 per call of the listing). */
export async function runCrmBinJob(limit = 100): Promise<BinJobReport> {
  const report: BinJobReport = { anonymized: 0, failed: [] };
  const due = await withCrmModuleTx(async (client) => {
    const { rows } = await client.query<{ id: string; organization_id: string }>(
      `SELECT id::text, organization_id::text FROM crm.bin_expired_contacts($1)`,
      [limit],
    );
    return rows;
  });
  for (const item of due) {
    try {
      const files = await deleteFiles(item.organization_id, item.id);
      if (await anonymize(item.organization_id, item.id, files)) report.anonymized += 1;
    } catch (error) {
      report.failed.push({ contactId: item.id, organizationId: item.organization_id, error });
    }
  }
  return report;
}
