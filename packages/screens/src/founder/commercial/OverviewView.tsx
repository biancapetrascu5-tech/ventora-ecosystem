'use client';

import { useTranslations } from 'next-intl';
import {
  AttentionList,
  Button,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
  ProgressBar,
  Sheet,
  SheetSection,
  Skeleton,
  Stat,
  StatusPill,
  type AttentionItem,
  type IconName,
} from '@ventora/ui';
import { useIsPhone } from '../../screens/hooks';
import { useTableLabels } from '../BusinessesView';
import businessStyles from '../business.module.css';
import s from './commercial.module.css';
import { amount, count, currencySuffix, money, type Currency } from './money';

/* FounderOverview (S118): „Prezentare”, prima pagină după intrare — salutul după ora zilei,
   cifrele, „Au nevoie de tine” (cererile noi din Hub, excepțiile care expiră în 7 zile cu
   „Prelungește”), afacerile peste 80% dintr-o limită și ultimele afaceri create; totul în regulă,
   prima zi, eroare la încărcare. Venitul lunar recurent: doar valoarea, fără schimbarea față de
   luna trecută (decizia 04.11.2026). Lotul 3.6: cardul „Plăți eșuate” (attention, cu suma de
   încasat), plata eșuată și disputa Stripe (danger) și factura neemisă (attention, D-3.6-4, text
   provizoriu) în „Au nevoie de tine”. Suportul (Lotul 4.6) lipsește, nu apare gol. Doar română
   (S57). */

export type OverviewState = 'ready' | 'first' | 'error';

export type OverviewException = {
  id: string;
  /** „8 noiembrie” */
  date: string;
  business: string;
  /** „Locuri în echipă: 12” */
  what: string;
  who: string;
  /** „peste 4 zile” */
  when: string;
};

export type OverviewLimitRow = {
  id: string;
  business: string;
  /** „Programări” */
  limit: string;
  used: number;
  max: number;
};

export type OverviewRecentRow = {
  id: string;
  name: string;
  /** „Business · EasyBook, ClientDesk” */
  what: string;
  /** „28 oct.” */
  created: string;
  status: 'invited' | 'trial' | 'active' | 'suspended';
};

export type OverviewFailedPayment = {
  id: string;
  organizationId: string;
  business: string;
  amountMinor: number;
  currency: Currency;
  /** „5 noiembrie, 09:00”; null: Stripe nu mai încearcă. */
  next: string | null;
  /** „ieri” */
  when: string;
};

export type OverviewDispute = {
  id: string;
  business: string;
  amountMinor: number;
  currency: Currency;
  /** „12 noiembrie”; null: Stripe n-a dat încă termenul. */
  due: string | null;
  url: string;
};

export type OverviewInvoiceIssue = {
  id: string;
  organizationId: string;
  business: string;
  amountMinor: number;
  currency: Currency;
  status: 'pending' | 'failed';
  attempts: number;
};

export type OverviewData = {
  stats: {
    active: number;
    newThisMonth: number;
    month: string;
    /** Venitul lunar recurent, în unități minore: lei și euro separat, fără conversie. */
    mrr: { RON: number; EUR: number };
    trial: number;
    trialEnding: number;
  };
  requests: { n: number; meta: string };
  exceptions: OverviewException[];
  limits: OverviewLimitRow[];
  recent: OverviewRecentRow[];
  /** Lotul 3.6 */
  failedPayments: OverviewFailedPayment[];
  disputes: OverviewDispute[];
  invoices: OverviewInvoiceIssue[];
};

const PILL: Record<OverviewRecentRow['status'], ['neutral' | 'done', IconName]> = {
  invited: ['neutral', 'clock'],
  trial: ['neutral', 'timer'],
  active: ['done', 'check'],
  suspended: ['neutral', 'lock'],
};

/** Cifra din card fără bani: „18.940” (anualul împărțit la 12 lasă zecimale). */
const roundUnits = (minor: number) => Math.round(minor / 100) * 100;

/** „dimineața” până la 12, „ziua” până la 18, apoi „seara” (ora din fusul dat). */
export function greetingPart(hour: number): 'morning' | 'day' | 'evening' {
  return hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening';
}

export function OverviewView({
  state,
  greeting,
  lead,
  updated,
  data,
  onOpenRequests,
  onExtend,
  onOpenUsage,
  onOpenBusiness,
  onOpenStripe,
  onAllBusinesses,
  onNewBusiness,
  onRetry,
}: {
  state: OverviewState;
  /** „Bună dimineața, Bianca” — din `founder.overview.greeting.*` */
  greeting: string;
  /** „Miercuri, 4 noiembrie. Ce s-a schimbat de ieri și ce te așteaptă.” */
  lead: string;
  /** „Actualizat la 09:41” */
  updated?: string;
  data?: OverviewData;
  onOpenRequests: () => void;
  onExtend: (id: string) => void;
  onOpenUsage: () => void;
  onOpenBusiness: (id: string) => void;
  /** Lotul 3.6: „Răspunde în Stripe” (disputa în Stripe, în altă filă). */
  onOpenStripe: (url: string) => void;
  onAllBusinesses: () => void;
  onNewBusiness: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('founder.overview');
  const phone = useIsPhone();
  const tableLabels = useTableLabels();
  const stats = phone ? `${s.foStats} ${s.foStatsMob}` : s.foStats;

  let body;
  if (state === 'first') {
    body = (
      <EmptyState
        icon="building-2"
        title={t('first.title')}
        description={t('first.body')}
        actions={
          <Button variant="primary" icon="plus" onPress={onNewBusiness}>
            {t('first.action')}
          </Button>
        }
      />
    );
  } else if (state === 'error' || !data) {
    body = (
      <div className={s.xStack}>
        <Notice tone="danger" title={t('error.title')}>
          <div className={s.xStack}>
            <p>{t('error.body')}</p>
            <div>
              <Button size="sm" variant="secondary" icon="refresh-cw" onPress={onRetry}>
                {t('error.retry')}
              </Button>
            </div>
          </div>
        </Notice>
        <div className={stats}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={s.foSk}>
              <Skeleton width="60%" height={12} />
              <Skeleton width="40%" height={28} />
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    const items: AttentionItem[] = [
      ...(data.requests.n
        ? [
            {
              id: 'req',
              icon: 'inbox' as const,
              tone: 'attention' as const,
              title: t('attention.requests', { n: data.requests.n }),
              meta: data.requests.meta,
              actions: [
                { label: t('attention.requestsAction'), primary: true, onPress: onOpenRequests },
              ],
            },
          ]
        : []),
      ...data.failedPayments.map((f) => ({
        id: `pay:${f.id}`,
        icon: 'circle-x' as const,
        tone: 'danger' as const,
        title: t('attention.failed', { business: f.business }),
        meta: f.next
          ? t('attention.failedMeta', { amount: money(f.amountMinor, f.currency), date: f.next })
          : t('attention.failedMetaLast', { amount: money(f.amountMinor, f.currency) }),
        time: f.when,
        actions: [
          { label: t('attention.failedAction'), onPress: () => onOpenBusiness(f.organizationId) },
        ],
      })),
      ...data.invoices.map((x) => ({
        id: `inv:${x.id}`,
        icon: 'file-text' as const,
        tone: 'attention' as const,
        title: t('attention.invoice', { business: x.business }),
        meta:
          x.status === 'failed'
            ? t('attention.invoiceMeta', { amount: money(x.amountMinor, x.currency) })
            : t('attention.invoiceMetaPending', {
                amount: money(x.amountMinor, x.currency),
                n: x.attempts,
              }),
        actions: [
          { label: t('attention.failedAction'), onPress: () => onOpenBusiness(x.organizationId) },
        ],
      })),
      ...data.exceptions.map((x) => ({
        id: x.id,
        icon: 'clock' as const,
        title: t('attention.exception', { date: x.date, business: x.business }),
        meta: x.who ? t('attention.exceptionMeta', { what: x.what, who: x.who }) : x.what,
        time: x.when,
        actions: [
          {
            label: t('attention.extend'),
            icon: 'calendar' as const,
            onPress: () => onExtend(x.id),
          },
        ],
      })),
      ...data.disputes.map((d) => ({
        id: `dis:${d.id}`,
        icon: 'triangle-alert' as const,
        tone: 'danger' as const,
        title: t('attention.dispute', { business: d.business }),
        meta: d.due
          ? t('attention.disputeMeta', { amount: money(d.amountMinor, d.currency), date: d.due })
          : t('attention.disputeMetaNoDate', { amount: money(d.amountMinor, d.currency) }),
        actions: [
          {
            label: t('attention.disputeAction'),
            icon: 'external-link' as const,
            onPress: () => onOpenStripe(d.url),
          },
        ],
      })),
    ];
    const st = data.stats;
    // „Plăți eșuate”: câte și suma de încasat, lei și euro separat (fără conversie)
    const toCollect = { RON: 0, EUR: 0 };
    for (const f of data.failedPayments) toCollect[f.currency] += f.amountMinor;
    const failedHint = (['RON', 'EUR'] as const)
      .filter((c) => toCollect[c])
      .map((c) => money(toCollect[c], c))
      .join(' + ');
    body = (
      <div className={s.stack6}>
        <div className={stats}>
          <Stat
            label={t('stat.active')}
            value={count(st.active)}
            delta={
              st.newThisMonth
                ? {
                    value: `+${st.newThisMonth}`,
                    period: t('stat.activeDelta', { month: st.month }),
                    direction: 'up',
                    good: true,
                  }
                : undefined
            }
          />
          <Stat
            label={t('stat.mrr')}
            value={amount(roundUnits(st.mrr.RON))}
            unit={currencySuffix('RON')}
            hint={
              st.mrr.EUR
                ? t('stat.mrrEur', { amount: money(roundUnits(st.mrr.EUR), 'EUR') })
                : undefined
            }
          />
          <Stat
            label={t('stat.trial')}
            value={count(st.trial)}
            hint={st.trialEnding ? t('stat.trialHint', { n: st.trialEnding }) : undefined}
          />
          <Stat
            label={t('stat.failed')}
            value={count(data.failedPayments.length)}
            tone={data.failedPayments.length ? 'attention' : 'neutral'}
            icon={data.failedPayments.length ? 'circle-x' : undefined}
            hint={failedHint ? t('stat.failedHint', { amount: failedHint }) : undefined}
          />
        </div>
        <div className={phone ? `${s.xGrid} ${s.xGridMob}` : s.xGrid}>
          <div className={s.xCol}>
            <Sheet>
              <SheetSection title={t('attention.title')}>
                <AttentionList
                  items={items}
                  empty={
                    <EmptyState
                      size="sm"
                      icon="circle-check"
                      title={t('attention.allGood')}
                      description={t('attention.allGoodBody')}
                    />
                  }
                />
              </SheetSection>
            </Sheet>
            {data.recent.length > 0 && (
              <Sheet>
                <SheetSection title={t('recent.title')}>
                  <div className={s.xStack}>
                    <DataTable
                      caption={t('recent.title')}
                      labels={tableLabels}
                      rows={data.recent}
                      rowKey={(r) => r.id}
                      onRowClick={(r) => onOpenBusiness(r.id)}
                      columns={[
                        { key: 'name', header: t('recent.col.business'), primary: true },
                        { key: 'what', header: t('recent.col.bundle'), secondary: true },
                        { key: 'created', header: t('recent.col.created'), optional: true },
                        {
                          key: 'status',
                          header: t('recent.col.status'),
                          trailing: true,
                          render: (r) => (
                            <StatusPill tone={PILL[r.status][0]} icon={PILL[r.status][1]}>
                              {t(`recent.status.${r.status}`)}
                            </StatusPill>
                          ),
                        },
                      ]}
                    />
                    <div>
                      <Button
                        size="sm"
                        variant="quiet"
                        iconEnd="arrow-right"
                        onPress={onAllBusinesses}
                      >
                        {t('recent.all')}
                      </Button>
                    </div>
                  </div>
                </SheetSection>
              </Sheet>
            )}
          </div>
          <div className={s.xCol}>
            <Sheet>
              <SheetSection title={t('limits.title')} description={t('limits.lead')}>
                {data.limits.length ? (
                  <div className={s.xStack}>
                    {data.limits.map((r) => (
                      <div key={r.id} className={s.foLim}>
                        <span className="body-strong">{r.business}</span>
                        <ProgressBar
                          value={Math.round((r.used / r.max) * 100)}
                          size="sm"
                          label={t('limits.usage', {
                            limit: r.limit,
                            used: count(r.used),
                            max: count(r.max),
                          })}
                        />
                      </div>
                    ))}
                    <div>
                      <Button size="sm" variant="quiet" iconEnd="arrow-right" onPress={onOpenUsage}>
                        {t('limits.more')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="body-small muted">{t('limits.none')}</p>
                )}
              </SheetSection>
            </Sheet>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={state === 'first' ? t('title') : greeting}
        description={lead}
        meta={
          state === 'ready' && updated ? (
            <span className="caption muted">{updated}</span>
          ) : undefined
        }
      />
      <div className={businessStyles.axb}>
        {phone ? <div className={s.padPhone}>{body}</div> : body}
      </div>
    </>
  );
}
