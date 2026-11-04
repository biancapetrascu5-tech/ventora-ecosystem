import { AuditActions, appendAuditEventInTx } from '@ventora/audit';
import { writeOutboxEvent } from '@ventora/db-kit';
import { SupportAutoCloseWarningV1 } from '@ventora/contracts';
import { withHubTx, withModuleTx } from './db';
import { applyAction, findRequest } from './model';

/*
 * Lot 4.6 — S116-D18: a request that waits for the business (after the team's reply) closes by
 * itself after 7 days without an answer, with an e-mail the day before. Registered in the jobs of
 * the platform (Lot 4.2, every 15 minutes). support.auto_close_due (SECURITY DEFINER) lists only
 * ids and organizations; each request is then handled in its business's context, as support_rw,
 * one transaction each: a failure stays with its request, the others go on.
 *
 *   warn  → auto_close_warned_at + support.request.auto_close_warning (outbox → the notification)
 *   close → closed (system), the history row „auto_closed”, the audit row
 */

export interface SupportAutoCloseReport {
  warned: number;
  closed: number;
  failed: { requestId: string; organizationId: string; error: unknown }[];
}

export async function runSupportAutoCloseJob(
  now: Date = new Date(),
): Promise<SupportAutoCloseReport> {
  const report: SupportAutoCloseReport = { warned: 0, closed: 0, failed: [] };
  const due = await withModuleTx(async (client) => {
    const { rows } = await client.query<{
      id: string;
      organization_id: string;
      action: 'warn' | 'close';
    }>(`SELECT id::text, organization_id::text, action FROM support.auto_close_due(100)`);
    return rows;
  });
  for (const item of due) {
    try {
      const done = await withHubTx(item.organization_id, async (client, exec) => {
        const request = await findRequest(client, { id: item.id }, true);
        // answered or closed in the meantime: nothing to do
        if (!request || request.status !== 'awaiting_business' || !request.autoCloseAt) return null;
        if (request.autoCloseAt.getTime() <= now.getTime()) {
          await applyAction(client, request, 'system_auto_close', {
            type: 'system',
            id: null,
            name: null,
          });
          await appendAuditEventInTx(exec, {
            category: 'support',
            action: AuditActions.supportRequestAutoClosed,
            outcome: 'success',
            actorType: 'system',
            organizationId: item.organization_id,
            targetType: 'support_request',
            targetId: request.id,
            metadata: { ref: request.ref, autoCloseAt: request.autoCloseAt.toISOString() },
          });
          return 'closed' as const;
        }
        const marked = await client.query(
          `UPDATE support.support_request SET auto_close_warned_at = now()
            WHERE id = $1::uuid AND auto_close_warned_at IS NULL`,
          [request.id],
        );
        if (marked.rowCount !== 1) return null;
        await writeOutboxEvent(client, 'support', SupportAutoCloseWarningV1, {
          organizationId: item.organization_id,
          sourceApp: SupportAutoCloseWarningV1.sourceApp,
          resourceId: request.id,
          payload: { requestId: request.id, closesAt: request.autoCloseAt.toISOString() },
        });
        return 'warned' as const;
      });
      if (done === 'closed') report.closed += 1;
      if (done === 'warned') report.warned += 1;
    } catch (error) {
      report.failed.push({ requestId: item.id, organizationId: item.organization_id, error });
    }
  }
  return report;
}
