'use client';

import { cn } from '../lib/cn';
import styles from './PortalPresence.module.css';

export type PortalStatus = 'published' | 'hidden' | 'draft';

export interface PortalPresenceProps {
  status: PortalStatus;
  canManage?: boolean;
  onManage?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPreview?: () => void;
  previewHref?: string;
  compact?: boolean;
}

// TODO: i18n — all strings below
const STATUS_LABELS: Record<PortalStatus, string> = {
  published: 'Publicată',
  hidden: 'Ascunsă',
  draft: 'Nu e publicată încă',
};

export function PortalPresence({
  status,
  canManage = true,
  onManage,
  onPreview,
  previewHref,
  compact = false,
}: PortalPresenceProps) {
  const manageLabel = status === 'draft' ? 'Termină pagina' : 'Gestionează pagina'; // TODO: i18n

  return (
    <div className={cn(styles.card, 'v-portalcard', compact && styles.compact)}>
      <div className={styles.meta}>
        <p className={styles.eyebrow}>
          {/* TODO: i18n */}
          Portal · pentru clienții tăi
          <span className={cn(styles.pill, styles[status])}>
            <span className={styles.pillDot} aria-hidden />
            {STATUS_LABELS[status]}
          </span>
        </p>
        <h3 className={styles.title}>
          {/* TODO: i18n */}
          Pagina afacerii în Portal
        </h3>
        <p className={styles.description}>
          {/* TODO: i18n */}
          Clienții te găsesc și programează din Portal. Aici schimbi ce văd ei.
        </p>
        {!canManage && (
          <p className={styles.memberNote}>
            {/* TODO: i18n */}
            Doar proprietarul și adminii pot schimba pagina.
          </p>
        )}
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
              {/* TODO: i18n */}
              Vezi cum arată în Portal
              <svg
                aria-label="(se deschide într-un tab nou)" // TODO: i18n
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
              {/* TODO: i18n */}
              Vezi cum arată în Portal
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
