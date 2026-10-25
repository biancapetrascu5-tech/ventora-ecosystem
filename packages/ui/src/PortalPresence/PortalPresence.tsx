'use client';

import { cn } from '../lib/cn';
import styles from './PortalPresence.module.css';

export type PortalStatus = 'published' | 'hidden' | 'draft';

export interface PortalPresenceTranslations {
  eyebrow: string;
  title: string;
  description: string;
  memberNote: string;
  manage: string;
  finish: string;
  preview: string;
  previewTab: string;
  statusPublished: string;
  statusHidden: string;
  statusDraft: string;
}

export interface PortalPresenceProps {
  status: PortalStatus;
  canManage?: boolean;
  onManage?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPreview?: () => void;
  previewHref?: string;
  compact?: boolean;
  translations: PortalPresenceTranslations;
}

export function PortalPresence({
  status,
  canManage = true,
  onManage,
  onPreview,
  previewHref,
  compact = false,
  translations: t,
}: PortalPresenceProps) {
  const statusLabel =
    status === 'published'
      ? t.statusPublished
      : status === 'hidden'
        ? t.statusHidden
        : t.statusDraft;

  const manageLabel = status === 'draft' ? t.finish : t.manage;

  return (
    <div className={cn(styles.card, 'v-portalcard', compact && styles.compact)}>
      <div className={styles.meta}>
        <p className={styles.eyebrow}>
          {t.eyebrow}
          <span className={cn(styles.pill, styles[status])}>
            <span className={styles.pillDot} aria-hidden />
            {statusLabel}
          </span>
        </p>
        <h3 className={styles.title}>{t.title}</h3>
        <p className={styles.description}>{t.description}</p>
        {!canManage && <p className={styles.memberNote}>{t.memberNote}</p>}
      </div>

      <div className={styles.actions}>
        {canManage && onManage && (
          <button type="button" className={styles.manageBtn} onClick={onManage}>
            {manageLabel}
          </button>
        )}

        {status === 'published' &&
          (previewHref || onPreview) &&
          (previewHref ? (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              {t.preview}
              <svg
                aria-label={t.previewTab}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          ) : (
            <button type="button" className={styles.externalLink} onClick={onPreview}>
              {t.preview}
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          ))}
      </div>
    </div>
  );
}
