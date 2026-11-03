import { CommercialOwnerNotifiedV1 } from '@ventora/contracts';
import { getNotificationContactsInTx } from '@ventora/identity';
import {
  ownerNoticeType,
  sendNotification,
  type NotificationParams,
  type SqlClient,
} from '@ventora/notifications';
import { listManagersInTx } from '@ventora/organizations';

/*
 * Lot 3.7 — the consumer of `commercial.owner.notified` („Recomandă” / „Anunță proprietarul”,
 * notifyOwner): the business's owner gets a notification in the Hub, with who sent it and what
 * it is about (the application, the pack, the limit). Runs in the dispatcher's transaction, in
 * the business's context, as commercial_rw (the event's module): the names of the application
 * and of the pack are read here; the owners (core/organizations) and the sender's name
 * (core/identity) through their modules. The same person asking for the same thing on the same
 * day → one notification (the idempotency key); delivered twice → one notification.
 */

type Envelope = { eventId: string; organizationId: string; payload: unknown };

/** The `resource` of a limit: its i18n key (D4-28, said in the reader's language). */
export const quotaResourceKey = (quotaKey: string) =>
  `quota.${quotaKey.replace(/\./g, '_')}.resource`;

export const ownerNotifiedConsumer = {
  name: 'notifications.commercial-owner-notified',
  handles: [{ type: CommercialOwnerNotifiedV1.type, version: CommercialOwnerNotifiedV1.version }],
  async handle(envelope: Envelope, tx: SqlClient): Promise<void> {
    const p = CommercialOwnerNotifiedV1.parse(envelope.payload);
    const organizationId = envelope.organizationId;
    const owners = (await listManagersInTx(tx, organizationId))
      .filter((m) => m.role === 'owner')
      .map((m) => m.userId);
    if (owners.length === 0) return;

    const contacts = await getNotificationContactsInTx(
      {
        query: async (sql, params) =>
          (await tx.query(sql, params)).rows as Record<string, unknown>[],
        exec: async (sql) => {
          await tx.query(sql);
        },
      },
      [p.userId],
    );
    const name = contacts.get(p.userId)?.name ?? '';
    const params: Record<string, NotificationParams[string]> = { name };
    if (p.targetType === 'application') {
      const { rows } = await tx.query(`SELECT name FROM commercial.application WHERE id = $1`, [
        p.targetId,
      ]);
      params.app = (rows[0] as { name: string } | undefined)?.name ?? p.targetId;
      params.appId = p.targetId;
    } else if (p.targetType === 'addon') {
      const { rows } = await tx.query(`SELECT name FROM commercial.addon WHERE id = $1::uuid`, [
        p.targetId,
      ]);
      const addon = rows[0] as { name: string } | undefined;
      if (!addon) throw new Error('[commercial] add-on not found for the event');
      params.pack = addon.name;
    } else {
      params.resource = { type: 'key', key: quotaResourceKey(p.targetId) };
    }

    await sendNotification(tx, {
      category: 'operational',
      type: ownerNoticeType(p.targetType),
      version: 1,
      organizationId,
      recipientUserIds: owners,
      ownerUserIds: owners,
      idempotencyKey: `owner_notice:${p.userId}:${p.targetType}:${p.targetId}:${p.day}`,
      params,
    });
  },
};
