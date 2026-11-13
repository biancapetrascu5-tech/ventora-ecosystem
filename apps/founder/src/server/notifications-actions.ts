'use server';

import { headers } from 'next/headers';
import { listBusinessesForFounder } from '@ventora/access';
import { restartCampaign } from '@ventora/growth';
import { requireFounderSession } from '@ventora/identity';
import {
  listFounderNotifications,
  markAllFounderNotificationsRead,
  markFounderNotificationRead,
  type FounderNotificationKind,
  type FounderNotificationParams,
  type FounderNotificationType,
} from '@ventora/notifications';
import { reportActionError } from './report-error';

/* FounderNotifications (S136; D4-29 a): clopoțelul Founder și pagina lui. Sesiunea Founder (cu
   2FA) vine din cookie și dă id-ul persoanei: citit / necitit e pe fiecare om. Numele afacerilor
   vin din core/access la afișare (o afacere redenumită apare cu numele de acum). Spre ecrane fără
   Date (ISO). */

export type FounderBellItem = {
  id: string;
  type: FounderNotificationType;
  kind: FounderNotificationKind;
  params: FounderNotificationParams;
  /** Numele afacerilor din params (organizationId / organizationIds), în ordine. */
  businesses: string[];
  actionPath: string | null;
  createdAt: string;
  read: boolean;
};

export type FounderBellData = { items: FounderBellItem[]; unread: number };

export async function readFounderNotifications(filters: {
  unreadOnly?: boolean;
  kind?: FounderNotificationKind | null;
}): Promise<FounderBellData | null> {
  try {
    const founderHeaders = await headers();
    const session = await requireFounderSession(founderHeaders);
    const inbox = await listFounderNotifications({
      founderId: session.userId,
      unreadOnly: filters.unreadOnly,
      kind: filters.kind ?? null,
    });
    const ids = (p: FounderNotificationParams): string[] => {
      const many = p.organizationIds;
      if (Array.isArray(many)) return many;
      return typeof p.organizationId === 'string' ? [p.organizationId] : [];
    };
    const needed = inbox.items.some((i) => ids(i.params).length > 0);
    const name = needed
      ? new Map((await listBusinessesForFounder({ founderHeaders })).map((b) => [b.id, b.name]))
      : new Map<string, string>();
    return {
      unread: inbox.unread,
      items: inbox.items.map((i) => ({
        id: i.id,
        type: i.type,
        kind: i.kind,
        params: i.params,
        businesses: ids(i.params).map((id) => name.get(id) ?? ''),
        actionPath: i.actionPath,
        createdAt: i.createdAt.toISOString(),
        read: i.read,
      })),
    };
  } catch (err) {
    reportActionError('readFounderNotifications', err);
    return null;
  }
}

export async function markFounderRead(id: string): Promise<{ ok: boolean }> {
  try {
    const session = await requireFounderSession(await headers());
    await markFounderNotificationRead({ founderId: session.userId, notificationId: id });
    return { ok: true };
  } catch (err) {
    reportActionError('markFounderRead', err);
    return { ok: false };
  }
}

export async function markAllFounderRead(): Promise<{ ok: boolean }> {
  try {
    const session = await requireFounderSession(await headers());
    await markAllFounderNotificationsRead({ founderId: session.userId });
    return { ok: true };
  } catch (err) {
    reportActionError('markAllFounderRead', err);
    return { ok: false };
  }
}

/** „Repornește” din Drawer-ul opririi automate: „Ce ai schimbat” și „Anunță-mă…”. */
export async function restartStoppedCampaign(input: {
  campaignId: string;
  whatChanged: string;
  notifyOnStop: boolean;
}): Promise<{ ok: boolean }> {
  try {
    await restartCampaign({
      founderHeaders: await headers(),
      campaignId: input.campaignId,
      whatChanged: input.whatChanged,
      notifyOnStop: input.notifyOnStop,
    });
    return { ok: true };
  } catch (err) {
    reportActionError('restartStoppedCampaign', err);
    return { ok: false };
  }
}
