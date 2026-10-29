'use client';

import { useId } from 'react';
import { AppIcon } from '../AppIcon/AppIcon';
import { Button } from '../Button/Button';
import type { IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { StatusPill, type StatusPillTone } from '../StatusPill/StatusPill';
import styles from './PortalPresence.module.css';

export type PortalStatus = 'published' | 'hidden' | 'draft';

export interface PortalPresenceLabels {
  /** S.portal_eyebrow, S.portal_title, S.portal_desc, S.portal_noManage. */
  eyebrow: string;
  title: string;
  description: string;
  noManage: string;
  /** S.portal_manage / S.portal_finish (pagina nepublicată). */
  manage: string;
  finish: string;
  /** S.portal_preview și S.newTab (în numele accesibil). */
  preview: string;
  newTab: string;
  /** S.portal_published, S.portal_hidden, S.portal_draft. */
  published: string;
  hidden: string;
  draft: string;
}

export interface PortalPresenceProps {
  status?: PortalStatus;
  /** Fără drept de gestionare: apare nota cu cine poate schimba pagina. */
  canManage?: boolean;
  onManage?: () => void;
  onPreview?: () => void;
  previewHref?: string;
  compact?: boolean;
  labels: PortalPresenceLabels;
  className?: string;
}

const STATUS: Record<PortalStatus, [StatusPillTone, IconName]> = {
  published: ['done', 'circle-check'],
  hidden: ['neutral', 'eye-off'],
  draft: ['attention', 'circle-alert'],
};

/* PortalPresence din bundle.js: cartonașul „Pagina afacerii în Portal” — starea paginii,
   „Gestionează pagina” și „Vezi cum arată în Portal”. */
export function PortalPresence({
  status = 'published',
  canManage = true,
  onManage,
  onPreview,
  previewHref,
  compact = false,
  labels,
  className,
}: PortalPresenceProps) {
  const titleId = useId();
  const [tone, icon] = STATUS[status] ?? STATUS.published;
  const preview =
    onPreview ?? (previewHref ? () => window.open(previewHref, '_blank', 'noopener') : undefined);
  const manage = canManage && (
    <Button variant="secondary" onPress={onManage}>
      {status === 'draft' ? labels.finish : labels.manage}
    </Button>
  );
  const prev = status !== 'draft' && (
    <Button
      variant="quiet"
      iconEnd="external-link"
      onPress={preview}
      aria-label={`${labels.preview} (${labels.newTab})`}
    >
      {labels.preview}
    </Button>
  );
  return (
    <section
      className={cn(styles.card, compact && styles.compact, className)}
      aria-labelledby={titleId}
    >
      <span className={styles.icon}>
        <AppIcon app="portal" size={compact ? 40 : 48} />
      </span>
      <div className={styles.text}>
        <p className={cn('caption', styles.eyebrow)}>{labels.eyebrow}</p>
        <h3 className={cn('heading', styles.title)} id={titleId}>
          {labels.title}
        </h3>
        <p className={cn('body', styles.desc)}>{labels.description}</p>
        {!canManage && <p className={cn('body-small', styles.note)}>{labels.noManage}</p>}
      </div>
      <StatusPill tone={tone} icon={icon} className={styles.pill}>
        {labels[status]}
      </StatusPill>
      {(manage || prev) && (
        <div className={styles.act}>
          {manage}
          {prev}
        </div>
      )}
    </section>
  );
}
