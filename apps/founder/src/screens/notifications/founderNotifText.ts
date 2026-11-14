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

/** Lot 5.9f: the codes from core/commercial (checkOfferTargets) that have a text. */
type ErrorCode =
  | 'app_retired'
  | 'app_no_price'
  | 'feature_retired'
  | 'addon_missing'
  | 'addon_sales_stopped'
  | 'addon_no_price'
  | 'plan_missing'
  | 'plan_not_on_sale'
  | 'plan_no_price';
const ERROR_CODES = new Set<string>([
  'app_retired',
  'app_no_price',
  'feature_retired',
  'addon_missing',
  'addon_sales_stopped',
  'addon_no_price',
  'plan_missing',
  'plan_not_on_sale',
  'plan_no_price',
]);

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

  /** The automatic stop, by reason (Lot 5.9f): the phrase under the title and in the Drawer. */
  const autoBody = (p: FounderBellItem['params']): string => {
    switch (p.reason) {
      case 'complaints':
        return t('live.complaintsBody', { n: n(p.complaints) });
      case 'budget':
        return p.offerType === 'trial'
          ? t('live.budgetBodyTrial', { n: n(p.budget) })
          : t('live.budgetBody', { n: n(p.budget) });
      case 'error': {
        const code = str(p.errorCode);
        return ERROR_CODES.has(code)
          ? t(`live.errorBody.${code as ErrorCode}`, { name: str(p.errorName) })
          : t('live.errorBody.other');
      }
      default:
        return t('live.autoBody', {
          rate: pct.format(n(p.rate)),
          impressions: num.format(n(p.impressions)),
          threshold: pct.format(n(p.threshold)),
        });
    }
  };

  /** Complaints and budget stop the offer, with all its campaigns. */
  const wholeOffer = (p: FounderBellItem['params']) =>
    (p.reason === 'complaints' || p.reason === 'budget') && str(p.offer) !== '';

  const text = (i: FounderBellItem): { title: string; body: string } => {
    const p = i.params;
    switch (i.kind) {
      case 'auto':
        return {
          title:
            p.reason === 'complaints' && str(p.offer)
              ? t('live.autoOffer', { name: str(p.offer) })
              : t('live.auto', { name: str(p.campaign) }),
          body: autoBody(p),
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
      reason:
        p.reason && p.reason !== 'disturbance'
          ? autoBody(p)
          : t('live.reason', {
              rate: pct.format(n(p.rate)),
              threshold: pct.format(n(p.threshold)),
              impressions: num.format(n(p.impressions)),
            }),
      stopped: wholeOffer(p)
        ? t('live.stoppedOffer', { offer: str(p.offer) })
        : str(p.offer)
          ? t('live.stopped', { name, offer: str(p.offer) })
          : t('live.stoppedNoOffer', { name }),
      when: at,
      businesses: num.format(n(p.businesses)),
    };
  };

  return { row, bell, detail, when };
}
