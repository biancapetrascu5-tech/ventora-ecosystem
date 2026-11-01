'use server';

import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { getSession } from '@ventora/identity';
import {
  getInbox,
  getNotificationPreferences,
  markAllNotificationsRead,
  openNotification,
  setNotificationPreference,
  toLocale,
  type NotificationPreferences,
} from '@ventora/notifications';
import { myMemberships, openInSession } from './route';
import { reportActionError } from './report-error';

/* Lot 4.4: the bell of the Hub shell and „Contul tău · Notificări”. The person always comes from
   the session, never from the client (S1); core/notifications reads and writes only their own
   rows (RLS on app.user_id). The texts are rendered in the language of the screen. */

export type BellItem = {
  id: string;
  title: string;
  body?: string;
  category: 'operational' | 'commercial';
  group: 'operational' | 'activity' | 'recommendation';
  organizationId: string | null;
  read: boolean;
  /** ISO; the shell writes it as „Azi, 14:32” (S110). */
  createdAt: string;
  /** S115: „Vezi factura →” under the text. */
  action?: string;
};

export type Bell = { items: BellItem[] };

const EMPTY: Bell = { items: [] };

export async function readBell(): Promise<Bell> {
  const session = await getSession(await headers());
  if (!session) return EMPTY;
  try {
    const inbox = await getInbox(session.userId, toLocale(await getLocale()));
    return {
      items: inbox.items.map((i) => ({
        id: i.id,
        title: i.title,
        ...(i.body ? { body: i.body } : {}),
        ...(i.action ? { action: i.action } : {}),
        category: i.category,
        group: i.group,
        organizationId: i.organizationId,
        read: i.read,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    // the bell never breaks the page: without a list it stays empty
    reportActionError('readBell', err);
    return EMPTY;
  }
}

/**
 * Opening a notification: it is read, and the person goes to its action. A notification of
 * another of their businesses first opens that business (membership checked, §7.4); one of a
 * business they no longer reach only becomes read.
 */
export async function openBellItem(
  id: string,
): Promise<{ href: string | null; switched: boolean } | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    const { actionUrl, organizationId } = await openNotification(session.userId, id);
    if (!actionUrl || !actionUrl.startsWith('/') || actionUrl.startsWith('//')) {
      return { href: null, switched: false };
    }
    if (!organizationId || organizationId === session.activeOrganizationId) {
      return { href: actionUrl, switched: false };
    }
    const reachable = (await myMemberships(session.userId)).some(
      (m) => m.organization_id === organizationId && m.organization_status === 'active',
    );
    if (!reachable) return { href: null, switched: false };
    await openInSession(session, organizationId);
    return { href: actionUrl, switched: true };
  } catch (err) {
    reportActionError('openBellItem', err);
    return null;
  }
}

export async function markBellRead(): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await markAllNotificationsRead(session.userId);
    return true;
  } catch (err) {
    reportActionError('markBellRead', err);
    return false;
  }
}

export async function readNotificationPreferences(): Promise<NotificationPreferences | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    return await getNotificationPreferences(session.userId);
  } catch (err) {
    reportActionError('readNotificationPreferences', err);
    return null;
  }
}

/** One switch of „Contul tău · Notificări”; the fixed rows are refused by the contract. */
export async function saveNotificationPreference(
  topic: string,
  channel: string,
  enabled: boolean,
): Promise<boolean> {
  const session = await getSession(await headers());
  if (!session) return false;
  try {
    await setNotificationPreference(session.userId, { topic, channel, enabled });
    return true;
  } catch (err) {
    reportActionError('saveNotificationPreference', err);
    return false;
  }
}
