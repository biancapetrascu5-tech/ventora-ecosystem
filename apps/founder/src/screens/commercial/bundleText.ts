'use client';

import { useTranslations } from 'next-intl';
import { money, type BundleCardData, type BundleStatus } from '@ventora/screens';
import type { APPS } from '@ventora/ui';
import type { AppData, BundleData, OfferData } from '@/server/commercial-actions';
import { dayDate, useQuotaText } from './labels';

/* Textele ecranelor de bundle (S117): perioadele de vânzare („1–30 nov. 2026”, „1–30
   noiembrie”), starea bundle-ului, prețul față de aplicațiile luate separat, ce include. */

type AppKey = keyof typeof APPS;
export const MEMBERS = 'platform.members';

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ro-RO', o).format(dayDate(iso));

/** „1–30 nov. 2026”, „1 sep. – 31 oct. 2026”, „15 nov. – 15 ian. 2027”. */
export function saleShort(from: string, until: string): string {
  const sameYear = from.slice(0, 4) === until.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === until.slice(5, 7);
  if (sameMonth)
    return `${Number(from.slice(8, 10))}–${fmt(until, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${fmt(from, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(until, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** „1–30 noiembrie”, „15 noiembrie – 15 decembrie”. */
export function saleLong(from: string, until: string): string {
  const sameMonth = from.slice(0, 7) === until.slice(0, 7);
  if (sameMonth)
    return `${Number(from.slice(8, 10))}–${fmt(until, { day: 'numeric', month: 'long' })}`;
  return `${fmt(from, { day: 'numeric', month: 'long' })} – ${fmt(until, { day: 'numeric', month: 'long' })}`;
}

export const today = () => new Date().toISOString().slice(0, 10);

const selling = (o: OfferData, d: string) =>
  o.published &&
  (!o.availableFrom || o.availableFrom <= d) &&
  (!o.availableUntil || o.availableUntil >= d);

/** Oferta care se vinde azi, altfel următoarea programată, altfel ultima publicată. */
export function currentOffer(b: BundleData): { offer: OfferData | null; status: BundleStatus } {
  const d = today();
  const published = b.offers.filter((o) => o.published);
  const now = [...published].reverse().find((o) => selling(o, d)) ?? null;
  const next = published.find((o) => o.availableFrom && o.availableFrom > d) ?? null;
  if (b.salesStoppedAt)
    return { offer: now ?? published[published.length - 1] ?? null, status: 'stopped' };
  if (now) return { offer: now, status: 'selling' };
  if (next) return { offer: next, status: 'scheduled' };
  return { offer: published[published.length - 1] ?? null, status: 'stopped' };
}

export function priceOf(
  o: OfferData | null,
  currency: 'RON' | 'EUR',
  kind: 'month' | 'year' | 'setup',
) {
  return o?.prices.find((p) => p.currency === currency && p.kind === kind)?.amountMinor ?? null;
}

export function appPrice(
  apps: AppData[],
  id: string,
  currency: 'RON' | 'EUR',
  kind: 'month' | 'year' | 'setup',
) {
  return (
    apps.find((a) => a.id === id)?.prices.find((p) => p.currency === currency && p.kind === kind)
      ?.amountMinor ?? 0
  );
}

export function useBundleCards() {
  const t = useTranslations('founder.bundles');
  const q = useQuotaText();
  return (data: {
    bundles: BundleData[];
    apps: AppData[];
    includedMembers: number;
  }): BundleCardData[] =>
    data.bundles.map((b) => {
      const { offer, status } = currentOffer(b);
      const biz = b.offers.reduce((s, o) => s + o.businesses, 0);
      const apps = (offer?.applications ?? []) as AppKey[];
      const sep = (c: 'RON' | 'EUR') =>
        apps.reduce((s, a) => s + appPrice(data.apps, a, c, 'month'), 0);
      const sepSetup = apps.reduce((s, a) => s + appPrice(data.apps, a, 'RON', 'setup'), 0);
      const m = priceOf(offer, 'RON', 'month');
      const seats = offer?.quotas[MEMBERS] ?? 0;
      const setup = priceOf(offer, 'RON', 'setup');
      const stoppedOn = b.salesStoppedAt
        ? fmt(b.salesStoppedAt.slice(0, 10), { day: 'numeric', month: 'short' })
        : offer?.availableUntil
          ? fmt(offer.availableUntil, { day: 'numeric', month: 'short' })
          : '';
      const d = today();
      const published = b.offers.filter((o) => o.published).reverse();
      const pct = m && sep('RON') ? Math.round(((sep('RON') - m) / sep('RON')) * 100) : 0;
      return {
        id: b.id,
        name: b.name,
        status,
        statusText:
          status === 'selling'
            ? t('status.selling')
            : status === 'scheduled'
              ? t('status.scheduled')
              : t('status.stopped', { date: stoppedOn }),
        subline: [
          status !== 'stopped' && offer?.availableFrom && offer.availableUntil
            ? t('available', { period: saleLong(offer.availableFrom, offer.availableUntil) })
            : null,
          t('bizTotal', { count: biz }),
        ]
          .filter(Boolean)
          .join(' · '),
        apps: apps as BundleCardData['apps'],
        price:
          m === null
            ? null
            : {
                month: t('perMonth', { amount: money(m, 'RON') }),
                monthEur: money(priceOf(offer, 'EUR', 'month') ?? 0, 'EUR'),
                year: t('perYear', { amount: money(priceOf(offer, 'RON', 'year') ?? 0, 'RON') }),
                yearEur: money(priceOf(offer, 'EUR', 'year') ?? 0, 'EUR'),
              },
        separate: apps.length
          ? {
              month: t('perMonth', { amount: money(sep('RON'), 'RON') }),
              monthEur: money(sep('EUR'), 'EUR'),
              saving: t('saving', {
                amount: money(Math.max(0, sep('RON') - (m ?? 0)), 'RON'),
                pct,
              }),
            }
          : null,
        includes: [
          ...Object.entries(offer?.quotas ?? {})
            .filter(([k]) => k !== MEMBERS)
            .map(([k, v]) => q.amount(k, v)),
          t('seatsLine', { bundle: seats ?? 0, total: data.includedMembers + (seats ?? 0) }),
          setup
            ? t('setupLine', { amount: money(setup, 'RON'), sep: money(sepSetup, 'RON') })
            : t('noSetup'),
        ],
        versions: published.map((o) => ({
          id: o.id,
          label: `v${o.number}`,
          pill:
            o.id === offer?.id && status === 'selling'
              ? { tone: 'done' as const, text: t('ver.now') }
              : o.availableFrom && o.availableFrom > d && status !== 'stopped'
                ? { tone: 'neutral' as const, text: t('ver.next') }
                : { tone: 'neutral' as const, text: t('ver.ended') },
          sale:
            o.availableFrom && o.availableUntil
              ? saleShort(o.availableFrom, o.availableUntil)
              : o.availableFrom
                ? t('saleFrom', {
                    date: fmt(o.availableFrom, { day: 'numeric', month: 'short', year: 'numeric' }),
                  })
                : t('saleOpen'),
          month: {
            lei: money(priceOf(o, 'RON', 'month') ?? 0, 'RON'),
            eur: money(priceOf(o, 'EUR', 'month') ?? 0, 'EUR'),
          },
          year: {
            lei: money(priceOf(o, 'RON', 'year') ?? 0, 'RON'),
            eur: money(priceOf(o, 'EUR', 'year') ?? 0, 'EUR'),
          },
          businesses: o.businesses,
          businessesAria: t('bizAria', { count: o.businesses, name: b.name, v: `v${o.number}` }),
        })),
        keepNote: published.length > 1 || status === 'stopped',
      };
    });
}
