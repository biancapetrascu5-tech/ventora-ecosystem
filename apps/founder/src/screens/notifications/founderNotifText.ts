'use client';

import { useTranslations } from 'next-intl';
import type { FounderAutoStopDetail, FounderNotifRow } from '@ventora/screens';
import type { NotificationData } from '@ventora/ui';
import { FOUNDER_NOTIF_ICON } from '@ventora/screens';
import type { FounderBellItem } from '@/server/notifications-actions';
import { useFounderAppName } from '../support/SupportInboxScreen';

/* FounderNotifications: din notificarea păstrată (tip + valori) în textele din design — rândul din
   pagină, rândul din clopoțel și Drawer-ul opririi automate. Founder e doar în română (README). */

const pct = new Intl.NumberFormat('ro', { style: 'percent', maximumFractionDigits: 1 });
const num = new Intl.NumberFormat('ro', {
  useGrouping: 'always',
} as unknown as Intl.NumberFormatOptions);
const time = new Intl.DateTimeFormat('ro', { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('ro', { day: 'numeric', month: 'short' });
const list = new Intl.ListFormat('ro', { type: 'conjunction' });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function useFounderNotifText() {
  const t = useTranslations('founder.notifications');
  const appName = useFounderAppName();

  /** „acum 8 min”, „azi, 09:10”, „ieri”, „7 nov.” */
  const when = (iso: string, now = new Date()) => {
    const d = new Date(iso);
    const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
    if (mins < 60) return t('t.min', { n: Math.max(mins, 1) });
    if (sameDay(d, now)) return t('t.today', { time: time.format(d) });
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (sameDay(d, y)) return t('t.yesterday');
    return day.format(d);
  };

  const text = (i: FounderBellItem): { title: string; body: string } => {
    const p = i.params;
    switch (i.kind) {
      case 'auto':
        return {
          title: t('live.auto', { name: str(p.campaign) }),
          body: t('live.autoBody', {
            rate: pct.format(n(p.rate)),
            impressions: num.format(n(p.impressions)),
            threshold: pct.format(n(p.threshold)),
          }),
        };
      case 'support': {
        const values = { app: appName(str(p.applicationId)), subject: str(p.subject) };
        return {
          title: t('live.support', { business: i.businesses[0] ?? '' }),
          body:
            p.urgency === 'blocking'
              ? t('live.supportBodyBlocking', values)
              : t('live.supportBody', values),
        };
      }
      case 'invoice':
        return {
          title: t('live.invoice', { n: n(p.n) }),
          body: t('live.invoiceBody', { businesses: list.format(i.businesses.filter(Boolean)) }),
        };
      case 'setup':
        return {
          title: t('live.setup', { business: i.businesses[0] ?? '' }),
          body: t('live.setupBody', { app: appName(str(p.applicationId)) }),
        };
    }
  };

  const row = (i: FounderBellItem, now?: Date): FounderNotifRow => ({
    id: i.id,
    kind: i.kind,
    ...text(i),
    when: when(i.createdAt, now),
    unread: !i.read,
  });

  const bell = (i: FounderBellItem, now?: Date): NotificationData => ({
    id: i.id,
    ...text(i),
    app: i.kind === 'auto' ? 'Growth' : t(`types.${i.kind}`),
    time: when(i.createdAt, now),
    icon: FOUNDER_NOTIF_ICON[i.kind],
    read: i.read,
    category: 'operational',
  });

  const detail = (i: FounderBellItem, now = new Date()): FounderAutoStopDetail => {
    const p = i.params;
    const name = str(p.campaign);
    const d = new Date(i.createdAt);
    const at = sameDay(d, now) ? t('live.today', { time: time.format(d) }) : day.format(d);
    return {
      name,
      subtitle: t('live.subtitle', {
        name,
        when: sameDay(d, now) ? t('t.today', { time: time.format(d) }) : day.format(d),
      }),
      reason: t('live.reason', {
        rate: pct.format(n(p.rate)),
        threshold: pct.format(n(p.threshold)),
        impressions: num.format(n(p.impressions)),
      }),
      stopped: str(p.offer)
        ? t('live.stopped', { name, offer: str(p.offer) })
        : t('live.stoppedNoOffer', { name }),
      when: at,
      businesses: num.format(n(p.businesses)),
    };
  };

  return { row, bell, detail, when };
}
