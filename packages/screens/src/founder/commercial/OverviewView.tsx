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
import { count } from './money';

/* FounderOverview (S118): „Prezentare”, prima pagină după intrare — salutul după ora zilei,
   cifrele, „Au nevoie de tine” (cererile noi din Hub, excepțiile care expiră în 7 zile cu
   „Prelungește”), afacerile peste 80% dintr-o limită și ultimele afaceri create; totul în regulă,
   prima zi, eroare la încărcare. Rândurile fără sursă încă (suportul, plățile eșuate, disputele) și
   cifrele „Venit lunar recurent” / „Plăți eșuate” lipsesc, nu apar goale. Doar română (S57). */

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

export type OverviewData = {
  stats: {
    active: number;
    newThisMonth: number;
    month: string;
    trial: number;
    trialEnding: number;
  };
  requests: { n: number; meta: string };
  exceptions: OverviewException[];
  limits: OverviewLimitRow[];
  recent: OverviewRecentRow[];
};

const PILL: Record<OverviewRecentRow['status'], ['neutral' | 'done', IconName]> = {
  invited: ['neutral', 'clock'],
  trial: ['neutral', 'timer'],
  active: ['done', 'check'],
  suspended: ['neutral', 'lock'],
};

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
    ];
    const st = data.stats;
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
            label={t('stat.trial')}
            value={count(st.trial)}
            hint={st.trialEnding ? t('stat.trialHint', { n: st.trialEnding }) : undefined}
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
