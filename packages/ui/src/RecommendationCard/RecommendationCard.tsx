'use client';

import type { ReactNode } from 'react';
import { AppIcon, type AppName } from '../AppIcon/AppIcon';
import { Button } from '../Button/Button';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { RecommendationLabel } from '../RecommendationLabel/RecommendationLabel';
import { StatusPill } from '../StatusPill/StatusPill';
import { RemindMenu, type RemindLabels } from './RemindMenu';
import styles from './RecommendationCard.module.css';

export interface RecommendationCardLabels {
  /** S.recommendation — eticheta și numele secțiunii. */
  recommendation: string;
  recommendSend: string;
  /** S.decides, ex. (who) => `Ajunge la ${who}.` */
  decides: (who: string) => string;
  /** S.recommendSent, ex. (who) => `Am trimis recomandarea către ${who}.` */
  recommendSent: (who: string) => string;
  recoActivated: string;
  recoDeclined: string;
  recoPending: string;
  remind: RemindLabels;
}

export interface RecommendationCardProps {
  app?: AppName;
  /** Iconița când nu e o aplicație (implicit package). */
  icon?: IconName;
  title: string;
  benefit?: ReactNode;
  cost?: ReactNode;
  /** owner acționează; member recomandă celui care decide. */
  role?: 'owner' | 'member';
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  decider?: string;
  onRecommend?: () => void;
  recommended?: boolean;
  status?: 'pending' | 'activated' | 'declined';
  onDismiss?: () => void;
  onRemindLater?: (when: 'week' | 'month') => void;
  /** Recomandare venită de la Ventora (are „…” și „Nu mă interesează”). */
  proactive?: boolean;
  labels: RecommendationCardLabels;
  className?: string;
}

/* RecommendationCard din bundle.js: eticheta „Recomandare”, aplicația, beneficiul și costul;
   proprietarul acționează, membrul o recomandă celui care decide. */
export function RecommendationCard({
  app,
  icon = 'package',
  title,
  benefit,
  cost,
  role = 'owner',
  actionLabel,
  actionIcon,
  onAction,
  decider,
  onRecommend,
  recommended = false,
  status,
  onDismiss,
  onRemindLater,
  proactive = true,
  labels,
  className,
}: RecommendationCardProps) {
  return (
    <section
      className={cn(styles.reco, className)}
      aria-label={`${labels.recommendation}: ${title}`}
    >
      <div className={styles.head}>
        <RecommendationLabel label={labels.recommendation} />
        {proactive && onRemindLater && (
          <RemindMenu onRemindLater={onRemindLater} labels={labels.remind} />
        )}
      </div>
      <div className={styles.body}>
        {app ? (
          <AppIcon app={app} size={40} />
        ) : (
          <span className={styles.icon} aria-hidden="true">
            <Icon icon={icon} size={20} />
          </span>
        )}
        <div className={styles.text}>
          <p className="body-strong">{title}</p>
          {benefit && <p className={cn('body-small', styles.benefit)}>{benefit}</p>}
          {cost && <p className={cn('body-small', 'v-num', styles.cost)}>{cost}</p>}
        </div>
      </div>
      <div className={styles.actions}>
        {role === 'owner' ? (
          <Button
            variant="primary"
            size="sm"
            icon={actionIcon}
            onPress={onAction}
            className={styles.main}
          >
            {actionLabel}
          </Button>
        ) : recommended ? (
          <>
            <StatusPill
              size="sm"
              tone={status === 'activated' ? 'done' : 'neutral'}
              icon={status === 'activated' ? 'check' : status === 'declined' ? undefined : 'clock'}
            >
              {status === 'activated'
                ? labels.recoActivated
                : status === 'declined'
                  ? labels.recoDeclined
                  : labels.recoPending}
            </StatusPill>
            {(!status || status === 'pending') && (
              <span className={cn('body-small', styles.sent)}>
                {labels.recommendSent(decider ?? '')}
              </span>
            )}
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="send"
              onPress={onRecommend}
              className={styles.main}
            >
              {actionLabel ?? labels.recommendSend}
            </Button>
            {decider && (
              <span className={cn('caption', styles.decider)}>{labels.decides(decider)}</span>
            )}
          </>
        )}
        {proactive && onDismiss && (
          <Button variant="quiet" size="sm" onPress={onDismiss}>
            {labels.remind.notInterested}
          </Button>
        )}
      </div>
    </section>
  );
}
