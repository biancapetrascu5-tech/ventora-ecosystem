'use client';

import type { ReactNode } from 'react';
import { Button } from '../Button/Button';
import { cn } from '../lib/cn';
import { RecommendationLabel } from '../RecommendationLabel/RecommendationLabel';
import styles from './DiscoveryTooltip.module.css';

export interface DiscoveryTooltipLabels {
  /** S.gotIt — închide sfatul. */
  gotIt: string;
  /** S.seeHow — „Vezi cum funcționează”. */
  seeHow: string;
  /** S.recommendation — eticheta, la sfaturile comerciale. */
  recommendation: string;
}

export interface DiscoveryTooltipProps {
  open?: boolean;
  title: string;
  body?: ReactNode;
  onGotIt?: () => void;
  onLearnMore?: () => void;
  placement?: 'bottom' | 'top';
  align?: 'start' | 'end';
  /** Sfat comercial: apare eticheta „Recomandare”. */
  commercial?: boolean;
  /** Elementul la care se referă sfatul. */
  children?: ReactNode;
  labels: DiscoveryTooltipLabels;
  className?: string;
}

/* DiscoveryTooltip din bundle.js: cartonașul cu săgeată lângă o funcție nouă — titlu, text,
   „Am înțeles” și, opțional, „Vezi cum funcționează”. */
export function DiscoveryTooltip({
  open = true,
  title,
  body,
  onGotIt,
  onLearnMore,
  placement = 'bottom',
  align = 'start',
  commercial = false,
  children,
  labels,
  className,
}: DiscoveryTooltipProps) {
  return (
    <span className={cn(styles.disco, className)}>
      {children}
      {open && (
        <span
          className={cn(styles.card, styles[placement], styles[align])}
          role="dialog"
          aria-label={title}
        >
          {commercial && <RecommendationLabel label={labels.recommendation} />}
          <span className={cn('body-strong', styles.title)}>{title}</span>
          {body && <span className={cn('body-small', styles.body)}>{body}</span>}
          <span className={styles.actions}>
            <Button size="sm" onPress={onGotIt}>
              {labels.gotIt}
            </Button>
            {onLearnMore && (
              <Button size="sm" variant="quiet" onPress={onLearnMore}>
                {labels.seeHow}
              </Button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
