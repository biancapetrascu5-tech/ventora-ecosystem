'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { APPS, AppIcon, Button, RecommendationLabel, Sheet, SheetSection } from '@ventora/ui';
import type { AppName } from '@ventora/ui';
import { useAppTileLabels } from '../labels';
import s from './growth.module.css';

/*
 * S147 (HubMyRecommendations, cadrul 5 „Proprietar · cardul cu nota”, 13.11): în pagina aplicației,
 * owner-ul / adminul vede recomandarea în așteptare a colegului: „Recomandare de la echipă”,
 * „{nume} recomandă {app}”, „Nota de la {nume}” cu nota (dacă există), apoi activarea (doar
 * owner-ul plătește) și „Respinge” (cu motivul opțional, RejectRecommendationDialog).
 */
export function TeamRecommendationCard({
  app,
  by,
  note,
  primary,
  onReject,
}: {
  app: AppName;
  /** Cine a recomandat. */
  by: string;
  /** Nota opțională a colegului. */
  note: string | null;
  /** Activarea (owner): „Activează · 49 lei pe lună” sau „Cere activare”; adminul n-o are. */
  primary?: ReactNode;
  onReject: () => void;
}) {
  const pay = useTranslations('pay');
  const tile = useAppTileLabels();
  const name = APPS[app]?.name ?? app;
  return (
    <Sheet>
      <SheetSection>
        <div className={s.recoCard}>
          <span className={s.recoRow}>
            <RecommendationLabel label={tile.recommendation} />
            <span className="caption muted">{pay('fromTeam')}</span>
          </span>
          <div className={s.recoMain}>
            <AppIcon app={app} size={40} />
            <div className={s.recoText}>
              <p className={`body-strong ${s.m0}`}>
                {pay('recommendsApp', { name: by, app: name })}
              </p>
              {note && (
                <>
                  <p className={`caption muted ${s.m0}`}>{pay('reco.note.from', { member: by })}</p>
                  <blockquote className={`body-small ${s.recoNote}`}>{note}</blockquote>
                </>
              )}
            </div>
          </div>
          <div className={s.recoActions}>
            {primary}
            <Button variant="quiet" size="sm" onPress={onReject}>
              {pay('reject')}
            </Button>
          </div>
        </div>
      </SheetSection>
    </Sheet>
  );
}
