'use client';

import { useState, useRef, useCallback } from 'react';
import { AppIcon, type AppName } from '../AppIcon/AppIcon';
import { cn } from '../lib/cn';
import styles from './AppDock.module.css';

export interface DockApp {
  app: AppName;
  name?: string;
  description: string;
  badge?: number;
  live?: { text: string; attention?: boolean };
}

export interface AppDockProps {
  apps: DockApp[];
  onOpen: (
    event: React.MouseEvent | React.KeyboardEvent,
    app: AppName,
    name: string,
    launch: { from: DOMRect; fromCard: DOMRect; iconEl: Element },
  ) => void;
  label?: string; // TODO: i18n
}

const APP_LABELS: Record<AppName, string> = {
  // TODO: i18n
  booking: 'Booking',
  crm: 'CRM',
  hr: 'HR',
  finance: 'Finance',
  projects: 'Projects',
  shifts: 'Shifts',
  documents: 'Documents',
  portal: 'Portal',
  inventory: 'Inventory',
  analytics: 'Analytics',
  marketing: 'Marketing',
  network: 'Network',
  contracts: 'Contracts',
  events: 'Events',
  assets: 'Assets',
};

export function AppDock({ apps, onOpen, label = 'Aplicațiile tale' }: AppDockProps) {
  // TODO: i18n label
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback((idx: number) => {
    setOpenIndex(idx);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setOpenIndex(null);
  }, []);

  const handleFocus = useCallback((idx: number) => {
    setOpenIndex(idx);
  }, []);

  const handleBlur = useCallback(() => {
    setOpenIndex(null);
  }, []);

  const handleClick = useCallback(
    (
      e: React.MouseEvent | React.KeyboardEvent,
      dockApp: DockApp,
      slotEl: HTMLElement | null,
      iconEl: HTMLElement | null,
    ) => {
      if (!slotEl || !iconEl) return;
      const from = iconEl.getBoundingClientRect();
      const fromCard = slotEl.getBoundingClientRect();
      const name = dockApp.name ?? APP_LABELS[dockApp.app];
      onOpen(e, dockApp.app, name, { from, fromCard, iconEl });
    },
    [onOpen],
  );

  return (
    <div className={styles.wrapper}>
      <div ref={dockRef} className={cn(styles.dock, 'v-dock')} role="list" aria-label={label}>
        {apps.map((dockApp, idx) => {
          const name = dockApp.name ?? APP_LABELS[dockApp.app];
          const isOpen = openIndex === idx;

          return (
            <div
              key={dockApp.app}
              className={cn(styles.slot, isOpen && styles.isOpen)}
              role="listitem"
              onMouseEnter={() => handleMouseEnter(idx)}
              onMouseLeave={handleMouseLeave}
              onFocus={() => handleFocus(idx)}
              onBlur={handleBlur}
            >
              {isOpen && (
                <div className={styles.card} role="tooltip">
                  <div className={styles.cardHead}>
                    <div className={styles.cardIconWrap}>
                      <AppIcon app={dockApp.app} size={48} title={name} />
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardName}>{name}</span>
                      <span className={styles.cardDesc}>{dockApp.description}</span>
                    </div>
                  </div>
                  {dockApp.live && (
                    <div className={styles.cardLive}>
                      {dockApp.live.attention && (
                        <span className={styles.cardLiveDot} aria-hidden />
                      )}
                      {dockApp.live.text}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                className={styles.item}
                aria-label={name}
                onClick={(e) => {
                  const slotEl = e.currentTarget.closest(`.${styles.slot}`) as HTMLElement | null;
                  const iconEl = e.currentTarget.querySelector('img') as HTMLElement | null;
                  handleClick(e, dockApp, slotEl, iconEl);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const slotEl = e.currentTarget.closest(`.${styles.slot}`) as HTMLElement | null;
                    const iconEl = e.currentTarget.querySelector('img') as HTMLElement | null;
                    handleClick(e, dockApp, slotEl, iconEl);
                  }
                }}
              >
                <div className={styles.iconWrap}>
                  <AppIcon app={dockApp.app} size={64} title={name} />
                  {dockApp.badge != null && dockApp.badge > 0 && (
                    <span className={styles.badge} aria-label={`${dockApp.badge} notificări`}>
                      {dockApp.badge}
                    </span>
                  )}
                </div>
                <span className={styles.name}>{name}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
