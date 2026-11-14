'use client';

import type { CSSProperties, MouseEvent } from 'react';
import type { AccessState } from '../AccessBadge/AccessBadge';
import type { AppName } from '../AppIcon/AppIcon';
import { AppTile, type AppTileLabels } from '../AppTile/AppTile';
import { Button } from '../Button/Button';
import type { IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './AppDock.module.css';

export interface DockApp {
  app: AppName;
  name?: string;
  icon?: IconName;
  description?: string;
  badge?: number;
  /** Linia de azi din fișă; `attention` adaugă punctul. */
  live?: { text: string; attention?: boolean };
  /** S147: aplicația neactivă — icon gri, fără linia de azi, o singură acțiune în fișă. */
  access?: AccessState;
  /** S147: înlocuiește acțiunea implicită a aplicației neactive. */
  action?: { label: string; onClick: () => void };
}

/** Pozițiile de pornire pentru AppLaunch. */
export interface DockLaunch {
  from?: DOMRect;
  fromCard?: DOMRect;
  iconEl?: Element | null;
}

export interface AppDockProps {
  apps: DockApp[];
  onOpen?: (
    e: MouseEvent<HTMLButtonElement>,
    app: AppName,
    name: string,
    launch: DockLaunch,
  ) => void;
  /** S.dock_label — numele listei. */
  label: string;
  /** Textele plăcuțelor (openApp, unreadN…). */
  tileLabels: AppTileLabels;
  /**
   * S147: acțiunea aplicației neactive — proprietar / admin „Vezi în Catalog” (`onCatalog`), membru
   * „Recomandă” (`onRecommend`). Implicit `owner`.
   */
  viewer?: 'owner' | 'member';
  onCatalog?: (app: AppName) => void;
  onRecommend?: (app: AppName) => void;
  /** S.seeInCatalog și S.recommendSend. */
  seeInCatalogLabel?: string;
  /** Stare forțată (galerii): aplicația deschisă în fișă și cea cu focus de tastatură. */
  hoverIndex?: number;
  focusIndex?: number;
  className?: string;
}

/* AppDock din bundle.js: rândul de iconuri al launcherului; la hover sau focus, iconul se deschide
   în fișa aplicației (descriere + linia de azi). Pe telefon (containerul vdock ≤ 560px) e o grilă. */
export function AppDock({
  apps,
  onOpen,
  label,
  tileLabels,
  viewer = 'owner',
  onCatalog,
  onRecommend,
  seeInCatalogLabel,
  hoverIndex,
  focusIndex,
  className,
}: AppDockProps) {
  return (
    <div className={cn(styles.wrap, className)}>
      <div className={styles.dock} role="list" aria-label={label}>
        {apps.map((a, i) => {
          const ok = !a.access || a.access === 'available';
          const act = ok
            ? null
            : a.action
              ? { label: a.action.label, fn: a.action.onClick }
              : viewer === 'member'
                ? onRecommend
                  ? { label: tileLabels.recommend, fn: () => onRecommend(a.app) }
                  : null
                : onCatalog && seeInCatalogLabel
                  ? { label: seeInCatalogLabel, fn: () => onCatalog(a.app) }
                  : null;
          return (
            <div
              key={a.app || a.name}
              className={cn(
                styles.item,
                !ok && styles.isLocked,
                hoverIndex === i && styles.isHover,
              )}
              role="listitem"
              style={{ '--i': i } as CSSProperties}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  e.currentTarget.querySelector<HTMLButtonElement>('[data-apptile-icon]')?.click();
                }
              }}
            >
              <div className={styles.card} data-dock-card="">
                <AppTile
                  app={a.app}
                  name={a.name}
                  icon={a.icon}
                  layout="icon"
                  access={ok ? 'available' : a.access}
                  badge={a.badge}
                  state={focusIndex === i ? 'focus' : undefined}
                  labels={tileLabels}
                  onOpen={
                    onOpen
                      ? (e, nm) => {
                          const card = e.currentTarget.closest('[data-dock-card]');
                          const ic = card?.querySelector('[data-apptile-iconwrap] > svg');
                          onOpen(e, a.app, nm, {
                            from: ic?.getBoundingClientRect(),
                            fromCard: card?.getBoundingClientRect(),
                            iconEl: ic,
                          });
                        }
                      : undefined
                  }
                />
                {a.description && <p className={styles.desc}>{a.description}</p>}
                {ok && a.live && (
                  <p className={styles.live}>
                    {a.live.attention && <span className={styles.dot} aria-hidden="true" />}
                    {a.live.text}
                  </p>
                )}
                {act && (
                  <div className={styles.act}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        act.fn();
                      }}
                    >
                      {act.label}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
