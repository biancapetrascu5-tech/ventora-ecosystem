'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  AccessBadge,
  AppIcon,
  APPS,
  Icon,
  PageHeader,
  RecommendationLabel,
  StatusPill,
  type AppName,
} from '@ventora/ui';
import { useAppTileLabels } from '../labels';
import s from './apps.module.css';

/* HubCatalogApp (Lotul 3.7, S113 / S117): pagina unei aplicații din catalog — ce face, de ce se
   leagă și, în dreapta, prețul (mentenanța), cum se plătește, implementarea, ce include; jos,
   acțiunile: owner-ul activează („Activează · 49 lei pe lună”) sau cere activarea (la cerere);
   ceilalți recomandă aplicația owner-ului. „De ce ți-o recomandăm” și perioada de probă apar doar
   în galerie (Growth: F5; proba: Lotul 3.8). Vedere fără logică. */

export type AppViewProps = {
  phone: boolean;
  app: AppName;
  lead: string;
  /** „Toate aplicațiile” → /apps */
  allHref: string;
  allLabel: string;
  /** Nu e în abonament (și, în galerie, recomandată); sau starea ei, dacă e deținută. */
  notInPlan: boolean;
  recommended?: boolean;
  /** Deținută: „Inclusă în bundle-ul Business” / „Aplicație la bucată”. */
  owned?: string;
  why?: { title: string; text: string };
  features?: string[];
  links?: AppName[];
  summary: Array<{ label: string; value: string; strong?: boolean }>;
  includes?: { title: string; items: string[] };
  note?: string;
  actions?: ReactNode;
  /** S147: cardul recomandării din echipă (owner / admin), sub titlu. */
  banner?: ReactNode;
};

export function AppView({
  phone,
  app,
  lead,
  allHref,
  allLabel,
  notInPlan,
  recommended,
  owned,
  why,
  features,
  links,
  summary,
  includes,
  note,
  actions,
  banner,
}: AppViewProps) {
  const t = useTranslations('hub.app');
  const tile = useAppTileLabels();
  const name = APPS[app]?.name ?? app;
  return (
    <div className={s.wrap}>
      <PageHeader
        title={name}
        breadcrumbs={phone ? undefined : [{ label: allLabel, href: allHref }, { label: name }]}
      />
      {banner}
      <div className={s.appdet}>
        <div className={`${s.main} ${s.sheetlike}`}>
          <div className={s.head}>
            <AppIcon app={app} size={64} />
            <div className={s.headText}>
              <span className={s.badges}>
                {recommended && <RecommendationLabel label={tile.recommendation} />}
                {notInPlan && <AccessBadge state="notInPlan" labels={tile.access} />}
                {owned && (
                  <StatusPill tone="done" icon="circle-check">
                    {owned}
                  </StatusPill>
                )}
              </span>
              <p className={`body muted ${s.m0}`}>{lead}</p>
            </div>
          </div>
          {why && (
            <div className={s.why}>
              <p className="subheading">{why.title}</p>
              <p className="body">{why.text}</p>
            </div>
          )}
          {features && features.length > 0 && (
            <div>
              <p className={`subheading ${s.m0}`}>{t('does')}</p>
              <ul className={`${s.list} body`}>
                {features.map((f) => (
                  <li key={f}>
                    <Icon icon="check" size={16} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {links && links.length > 0 && (
            <div>
              <p className={`subheading ${s.m0}`}>{t('links')}</p>
              <div className={s.links}>
                {links.map((a) => (
                  <span key={a} className={s.link}>
                    <AppIcon app={a} size={24} />
                    <span className="body">{APPS[a]?.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <aside className={`${s.side} ${s.sheetlike}`}>
          <dl className={s.sum}>
            {summary.map((r) => (
              <div key={r.label}>
                <dt className="caption">{r.label}</dt>
                <dd className={r.strong ? 'body-strong v-num' : 'body'}>{r.value}</dd>
              </div>
            ))}
          </dl>
          {includes && includes.items.length > 0 && (
            <div className={s.inc}>
              <p className={`caption muted ${s.m0}`}>{includes.title}</p>
              <ul className={`body-small ${s.incList}`}>
                {includes.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {note && <p className={`body-small muted ${s.m0}`}>{note}</p>}
          {actions}
        </aside>
      </div>
    </div>
  );
}
