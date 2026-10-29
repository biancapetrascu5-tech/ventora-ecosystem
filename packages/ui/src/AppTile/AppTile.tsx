'use client';

import type { MouseEvent, ReactNode } from 'react';
import { AccessBadge, type AccessLabels, type AccessState } from '../AccessBadge/AccessBadge';
import { AppIcon, APPS, type AppName } from '../AppIcon/AppIcon';
import { Badge } from '../Badge/Badge';
import btn from '../Button/Button.module.css';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import { RecommendationLabel } from '../RecommendationLabel/RecommendationLabel';
import { RemindMenu, type RemindLabels } from '../RecommendationCard/RemindMenu';
import styles from './AppTile.module.css';

export interface AppTileLabels {
  access: AccessLabels;
  /** S.hint_unavailable, S.hint_notInRole (cu cine dă acces), S.hint_notInRoleNoOne, S.hint_notInPlan. */
  hintUnavailable: string;
  hintNotInRole: (who: string) => string;
  hintNotInRoleNoOne: string;
  hintNotInPlan: string;
  requestAccess: string;
  writeUs: string;
  seeStatus: string;
  /** S.openApp, ex. (app) => `Deschide ${app}`. */
  openApp: (app: string) => string;
  /** S.unreadN — numele insignei cu necitite. */
  unreadN: (n: number) => string;
  seeDetails: string;
  /** S.recommendation — eticheta RecommendationLabel. */
  recommendation: string;
  remind: RemindLabels;
}

export interface AppTileRecommendation {
  reason: ReactNode;
  cost?: ReactNode;
}

export interface AppTileProps {
  app: AppName;
  /** Numele afișat (implicit numele din APPS). */
  name?: string;
  description?: ReactNode;
  icon?: IconName;
  access?: AccessState;
  /** Explicația stării blocate, în locul textului implicit. */
  reason?: ReactNode;
  /** Cine poate da acces (la notInRole). */
  grantedBy?: string;
  onOpen?: (e: MouseEvent<HTMLButtonElement>, name: string) => void;
  onRequestAccess?: () => void;
  onWriteUs?: () => void;
  onSeeStatus?: () => void;
  /** Necitite (doar la aplicațiile disponibile). */
  badge?: number;
  layout?: 'tile' | 'row' | 'icon';
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  /** Recomandare pentru o aplicație blocată (motivul și costul). */
  recommendation?: AppTileRecommendation;
  onDetails?: () => void;
  onDismiss?: () => void;
  onRemindLater?: (when: 'week' | 'month') => void;
  labels: AppTileLabels;
  className?: string;
}

/* AppTile din bundle.js: plăcuța unei aplicații — disponibilă (se deschide) sau blocată
   (indisponibilă, nu e în rol, nu e în abonament), cu acțiunea potrivită; layout tile / row / icon. */
export function AppTile({
  app,
  name,
  description,
  icon,
  access = 'available',
  reason,
  grantedBy,
  onOpen,
  onRequestAccess,
  onWriteUs,
  onSeeStatus,
  badge,
  layout = 'tile',
  state,
  recommendation,
  onDetails,
  onDismiss,
  onRemindLater,
  labels,
  className,
}: AppTileProps) {
  const nm = name ?? APPS[app]?.name ?? app;
  const ok = access === 'available';
  const hint =
    reason ??
    (access === 'unavailable'
      ? labels.hintUnavailable
      : access === 'notInRole'
        ? grantedBy
          ? labels.hintNotInRole(grantedBy)
          : labels.hintNotInRoleNoOne
        : access === 'notInPlan'
          ? labels.hintNotInPlan
          : null);
  const act = ok
    ? null
    : access === 'notInRole' && onRequestAccess
      ? { label: labels.requestAccess, fn: onRequestAccess }
      : access === 'notInPlan' && onWriteUs
        ? { label: labels.writeUs, fn: onWriteUs }
        : access === 'unavailable' && onSeeStatus
          ? { label: labels.seeStatus, fn: onSeeStatus }
          : null;
  const reco = !ok && recommendation ? recommendation : null;
  const act2 = reco && onDetails ? { label: labels.seeDetails, fn: onDetails } : null;
  const action = act2 ?? act;
  const lockedName = `${nm} — ${labels.access[access]}`;
  const badgeEl =
    ok && badge != null ? (
      <Badge
        tone="attention"
        count={badge}
        label={labels.unreadN(badge)}
        className={styles.badge}
      />
    ) : null;
  const open = (e: MouseEvent<HTMLButtonElement>) => onOpen?.(e, nm);
  const actBtn = action && (
    <button
      type="button"
      className={cn(btn.root, btn.secondary, btn.sm, styles.act)}
      onClick={action.fn}
    >
      <span className={cn(btn.label, 'body-strong')}>{action.label}</span>
    </button>
  );

  if (layout === 'icon') {
    return (
      <button
        type="button"
        className={cn(
          styles.tile,
          styles.icon,
          ok ? styles.available : styles.locked,
          forced(styles, state),
          className,
        )}
        onClick={ok ? open : undefined}
        aria-label={ok ? labels.openApp(nm) : lockedName}
        aria-disabled={ok ? undefined : 'true'}
        data-apptile-icon=""
        data-forced-focus={state === 'focus' ? '' : undefined}
      >
        <span className={styles.iconwrap} data-apptile-iconwrap="">
          <AppIcon app={app} icon={icon} size={56} muted={!ok} />
          {badgeEl}
        </span>
        <span className={cn('caption', styles.name)} data-apptile-name="">
          {nm}
        </span>
      </button>
    );
  }

  const text = (
    <div className={styles.text}>
      <span className={layout === 'row' ? 'body-strong' : 'heading'}>{nm}</span>
      {!ok &&
        (reco ? (
          <span className={styles.badges}>
            <RecommendationLabel label={labels.recommendation} />
            <AccessBadge state={access} labels={labels.access} className={styles.access} />
          </span>
        ) : (
          <AccessBadge state={access} labels={labels.access} className={styles.access} />
        ))}
      {ok && description && <span className={cn(styles.desc, 'body-small')}>{description}</span>}
      {!ok && !reco && hint && <span className={cn(styles.desc, 'body-small')}>{hint}</span>}
      {reco && <span className={cn(styles.desc, 'body-small')}>{reco.reason}</span>}
      {reco?.cost && <span className={cn(styles.cost, 'body-small', 'v-num')}>{reco.cost}</span>}
    </div>
  );

  if (layout === 'row') {
    const inner = (
      <>
        <AppIcon app={app} icon={icon} size={40} muted={!ok} />
        {text}
        {badgeEl}
        {ok && <Icon icon="chevron-right" size={16} className={styles.chev} />}
        {actBtn}
        {reco && (onDismiss || onRemindLater) && (
          <span className={styles.rowmore}>
            <RemindMenu
              onRemindLater={onRemindLater}
              onDismiss={onDismiss}
              labels={labels.remind}
            />
          </span>
        )}
      </>
    );
    return ok ? (
      <button
        type="button"
        className={cn(styles.tile, styles.row, styles.available, className)}
        onClick={open}
        aria-label={labels.openApp(nm)}
      >
        {inner}
      </button>
    ) : (
      <div
        className={cn(styles.tile, styles.row, styles.locked, className)}
        role="group"
        aria-disabled="true"
        aria-label={lockedName}
      >
        {inner}
      </div>
    );
  }

  const body = (
    <>
      <div className={styles.top}>
        <AppIcon app={app} icon={icon} size={44} muted={!ok} />
        {badgeEl}
      </div>
      {text}
    </>
  );
  return ok ? (
    <button
      type="button"
      className={cn(styles.tile, styles.available, forced(styles, state), className)}
      onClick={open}
      aria-label={labels.openApp(nm)}
    >
      {body}
      <Icon icon="arrow-right" size={16} className={styles.go} />
    </button>
  ) : (
    <div
      className={cn(styles.tile, styles.locked, className)}
      aria-disabled="true"
      role="group"
      aria-label={lockedName}
    >
      {body}
      {action && (
        <span className={styles.acts}>
          {actBtn}
          {reco && onDismiss && (
            <button type="button" className={cn(btn.root, btn.quiet, btn.sm)} onClick={onDismiss}>
              <span className={cn(btn.label, 'body-strong')}>{labels.remind.notInterested}</span>
            </button>
          )}
          {reco && onRemindLater && (
            <RemindMenu onRemindLater={onRemindLater} labels={labels.remind} />
          )}
        </span>
      )}
    </div>
  );
}
