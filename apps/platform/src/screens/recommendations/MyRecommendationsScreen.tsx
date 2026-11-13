'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AppIcon,
  Button,
  EmptyState,
  Icon,
  PageHeader,
  Sheet,
  SheetSection,
  StatusPill,
  type IconName,
} from '@ventora/ui';
import { useDates, useIsPhone } from '@ventora/screens';
import type { MyRecommendation, MyRecommendationsData } from '@/server/team-recommendation-actions';
import s from './recommendations.module.css';

/* HubMyRecommendations (S136, lotul 5.9e): ce a recomandat persoana proprietarului și răspunsul —
   „În așteptare” / „Activată” / „Nu acum”, „Recomandată lui {owner} pe {data}”, răspunsul
   owner-ului cu data (citatul doar dacă există: câmpul în care îl scrie nu e desenat încă) sau
   „Proprietarul n-a răspuns încă…”, „Deschide {app}” la cea activată; sub listă, regula.
   Gol: „Nicio recomandare”, „Deschide Catalogul”. */

const STATUS: Record<MyRecommendation['status'], ['neutral' | 'done', IconName, string]> = {
  pending: ['neutral', 'clock', 'pending'],
  active: ['done', 'check', 'active'],
  not_now: ['neutral', 'minus', 'notNow'],
};

/** EasyBook are rutele lui; restul, pagina aplicației. */
const appHref = (app: string) => (app === 'booking' ? '/booking' : `/applications/${app}`);

export function MyRecommendationsScreen({
  data,
  phone: forcedPhone,
}: {
  data: MyRecommendationsData;
  /** Galeria /design: cadrul de telefon, în orice fereastră. */
  phone?: boolean;
}) {
  const t = useTranslations('pay.mine');
  const router = useRouter();
  const dates = useDates();
  const isPhone = useIsPhone();
  const phone = forcedPhone ?? isPhone;
  const ownerFirst = data.owner.trim().split(/\s+/)[0] ?? data.owner;

  return (
    <>
      <PageHeader title={t('title')} description={phone ? undefined : t('lead')} />
      <div className={phone ? `${s.body} ${s.bodyMob}` : s.body}>
        {data.items.length === 0 ? (
          <Sheet>
            <SheetSection>
              <EmptyState
                icon="lightbulb"
                title={t('empty.title')}
                description={t('empty.body')}
                actions={
                  <Button
                    variant="secondary"
                    icon="layout-grid"
                    onPress={() => router.push('/applications')}
                  >
                    {t('empty.action')}
                  </Button>
                }
              />
            </SheetSection>
          </Sheet>
        ) : (
          <>
            <Sheet>
              <SheetSection
                title={t('count', { n: data.items.length })}
                description={t('countLead')}
              >
                <ul className={s.list}>
                  {data.items.map((r) => {
                    const [tone, icon, key] = STATUS[r.status];
                    return (
                      <li key={r.id} className={phone ? `${s.row} ${s.rowMob}` : s.row}>
                        <AppIcon app={r.app} size={32} />
                        <div className={s.main}>
                          <span className={s.head}>
                            <span className="body-strong">{r.name}</span>
                            <StatusPill tone={tone} icon={icon}>
                              {t(`st.${key}`)}
                            </StatusPill>
                          </span>
                          <span className="body-small muted">
                            {t('asked', {
                              owner: data.owner,
                              date: dates.day(new Date(r.recommendedAt)),
                            })}
                          </span>
                          {r.answer && r.decidedAt ? (
                            <span className="body-small">
                              {`${t('answer', {
                                owner: ownerFirst,
                                when: dates.day(new Date(r.decidedAt)),
                              })} „${r.answer}”`}
                            </span>
                          ) : r.status === 'pending' ? (
                            <span className="caption muted">{t('waiting')}</span>
                          ) : null}
                        </div>
                        {r.status === 'active' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            iconEnd="arrow-right"
                            onPress={() => router.push(appHref(r.app))}
                          >
                            {t('open', { app: r.name })}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </SheetSection>
            </Sheet>
            <div className={phone ? s.pad : undefined}>
              <p className={`body-small ${s.rule}`}>
                <Icon icon="info" size={16} />
                {t('rule')}
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
