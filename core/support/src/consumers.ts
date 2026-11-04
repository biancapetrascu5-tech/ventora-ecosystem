import { SupportAutoCloseWarningV1, SupportReplyPostedV1 } from '@ventora/contracts';
import { sendNotification, type SqlClient } from '@ventora/notifications';
import { organizationNameInTx } from '@ventora/organizations';

/*
 * Lot 4.6 — the consumers of the support events. They run in the dispatcher's transaction, in the
 * business's context, as support_rw (the event's module): the request is read here, the business's
 * name through core/organizations, and the notification is written by core/notifications (in the
 * app and, through the delivery job, by e-mail; the „Suport” row of the preferences, S114b).
 * The recipient is the person who opened the request. Delivered twice → one notification (the
 * idempotency key).
 */

type Envelope = { eventId: string; organizationId: string; payload: unknown };

type RequestFacts = {
  ref: string;
  subject: string;
  requester_user_id: string;
};

async function requestFacts(tx: SqlClient, requestId: string): Promise<RequestFacts> {
  const { rows } = await tx.query(
    `SELECT ref, subject, requester_user_id::text FROM support.support_request WHERE id = $1::uuid`,
    [requestId],
  );
  const row = rows[0] as RequestFacts | undefined;
  if (!row) throw new Error('[support] request not found for the event');
  return row;
}

/** support.reply.posted → „Răspuns nou la solicitarea ta” + E-7. */
export const supportReplyConsumer = {
  name: 'notifications.support-reply',
  handles: [{ type: SupportReplyPostedV1.type, version: SupportReplyPostedV1.version }],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const p = SupportReplyPostedV1.parse(envelope.payload);
    const request = await requestFacts(tx, p.requestId);
    const { rows } = await tx.query(
      `SELECT author_name FROM support.support_message
        WHERE id = $1::uuid AND request_id = $2::uuid AND author_type = 'team'`,
      [p.messageId, p.requestId],
    );
    const author = (rows[0] as { author_name: string } | undefined)?.author_name;
    if (!author) throw new Error('[support] team message not found for the event');
    const businessName = (await organizationNameInTx(tx, envelope.organizationId)) ?? '';
    await sendNotification(tx, {
      category: 'operational',
      type: 'support.reply',
      version: 1,
      organizationId: envelope.organizationId,
      recipientUserIds: [request.requester_user_id],
      idempotencyKey: `support.reply:${p.messageId}`,
      params: { subject: request.subject, author, ref: request.ref, businessName },
    });
  },
};

/** The Bucharest day of a moment (the date in the e-mail is a day, D4-28). */
export function bucharestDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** support.request.auto_close_warning → „Solicitarea ta se închide mâine” (S116-D18, S-7). */
export const supportAutoCloseWarningConsumer = {
  name: 'notifications.support-auto-close-warning',
  handles: [{ type: SupportAutoCloseWarningV1.type, version: SupportAutoCloseWarningV1.version }],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const p = SupportAutoCloseWarningV1.parse(envelope.payload);
    const request = await requestFacts(tx, p.requestId);
    const businessName = (await organizationNameInTx(tx, envelope.organizationId)) ?? '';
    const closesAt = new Date(p.closesAt);
    await sendNotification(tx, {
      category: 'operational',
      type: 'support.autoClose',
      version: 1,
      organizationId: envelope.organizationId,
      recipientUserIds: [request.requester_user_id],
      idempotencyKey: `support.autoClose:${p.requestId}:${p.closesAt}`,
      params: {
        subject: request.subject,
        ref: request.ref,
        businessName,
        closesAt: { type: 'date', date: bucharestDay(closesAt) },
      },
      // after the closing, the warning is pointless
      validUntil: closesAt,
    });
  },
};
