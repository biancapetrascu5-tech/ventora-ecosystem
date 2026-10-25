'use client';

import { useEffect, useRef, useCallback } from 'react';
import { AppIcon, type AppName } from '../AppIcon/AppIcon';
import { cn } from '../lib/cn';
import styles from './AppLaunch.module.css';

export interface AppLaunchProps {
  app: AppName;
  name?: string;
  from: DOMRect;
  fromCard?: DOMRect;
  iconEl?: Element;
  onDone?: () => void;
  waiting?: boolean;
  contained?: boolean;
  fromLocal?: boolean;
  progress?: number; // 0-1 for static doc frames
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AppLaunch({
  app,
  name,
  from,
  fromCard,
  onDone,
  // waiting and fromLocal are reserved for future use
  contained = false,
  progress,
}: AppLaunchProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const doneFiredRef = useRef(false);

  const fireDone = useCallback(() => {
    if (!doneFiredRef.current) {
      doneFiredRef.current = true;
      onDone?.();
    }
  }, [onDone]);

  useEffect(() => {
    if (progress !== undefined) return; // static frame, no animation

    const reduced = prefersReducedMotion();
    const surface = surfaceRef.current;
    const iconEl = iconRef.current;
    if (!surface || !iconEl) return;

    const container = surface.offsetParent as HTMLElement | null;
    const containerRect = container?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };

    if (reduced) {
      // Reduced motion: simple opacity fade
      surface.style.opacity = '0';
      surface.style.transition = `opacity 150ms var(--ease-standard)`;
      iconEl.style.opacity = '0';

      requestAnimationFrame(() => {
        surface.style.opacity = '1';
        iconEl.style.opacity = '1';
      });

      const timer = setTimeout(fireDone, 150);
      return () => clearTimeout(timer);
    }

    // Full animation
    const startRect = fromCard ?? from;

    // Phase 1: Position icon at from rect, swell it
    const iconStartX = from.left - containerRect.left + from.width / 2;
    const iconStartY = from.top - containerRect.top + from.height / 2;
    const iconSize = 64;
    const iconSwellSize = Math.round(iconSize * 1.12);

    iconEl.style.cssText = `
      left: ${iconStartX - iconSize / 2}px;
      top: ${iconStartY - iconSize / 2}px;
      width: ${iconSize}px;
      height: ${iconSize}px;
      opacity: 1;
      transform: scale(1);
      transition: transform 160ms var(--ease-spring), opacity 140ms var(--ease-standard);
    `;

    // Phase 1: swell the icon
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        iconEl.style.transform = `scale(${iconSwellSize / iconSize})`;
      });
    });

    // Phase 2 (150ms): Surface grows out of card rect
    const surfaceStartX = startRect.left - containerRect.left;
    const surfaceStartY = startRect.top - containerRect.top;
    const surfaceStartW = startRect.width;
    const surfaceStartH = startRect.height;
    const surfaceEndW = containerRect.width;
    const surfaceEndH = containerRect.height;

    const scaleX = surfaceStartW / surfaceEndW;
    const scaleY = surfaceStartH / surfaceEndH;
    const translateX = surfaceStartX - (surfaceEndW * (1 - scaleX)) / 2;
    const translateY = surfaceStartY - (surfaceEndH * (1 - scaleY)) / 2;

    surface.style.cssText = `
      opacity: 0;
      transform: translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY});
      transform-origin: top left;
      border-radius: var(--radius-xl);
      transition: none;
    `;

    const t2 = setTimeout(() => {
      surface.style.transition = `
        transform var(--duration-launch) var(--ease-standard),
        opacity 80ms var(--ease-standard),
        border-radius var(--duration-launch) var(--ease-standard)
      `;
      surface.style.opacity = '1';
      surface.style.transform = 'translate(0, 0) scale(1)';
      surface.style.borderRadius = '0';
    }, 150);

    // Phase 3 (560ms): icon moves toward center then fades
    const t3 = setTimeout(() => {
      iconEl.style.transition = 'opacity 200ms var(--ease-standard)';
      iconEl.style.opacity = '0';
    }, 560);

    const tDone = setTimeout(fireDone, 850);

    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(tDone);
    };
  }, [from, fromCard, fireDone, progress]);

  // Static doc frame
  if (progress !== undefined) {
    const p = Math.max(0, Math.min(1, progress));
    const surfaceOpacity = p > 0.15 ? Math.min(1, (p - 0.15) / 0.4) : 0;
    const iconScale = p < 0.15 ? 1 + 0.12 * (p / 0.15) : p < 0.55 ? 1.12 : Math.max(0, 1.12 - ((p - 0.55) / 0.45) * 1.12);
    const iconOpacity = p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.25);

    return (
      <div className={cn(styles.frame)} style={{ minHeight: 120, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--canvas)',
            opacity: surfaceOpacity,
            borderRadius: surfaceOpacity < 1 ? 'var(--radius-xl)' : 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) scale(${iconScale})`,
            opacity: iconOpacity,
          }}
        >
          <AppIcon app={app} size={64} title={name} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(styles.overlay, 'v-applaunch', contained ? styles.contained : styles.fullscreen)}
      role="status"
      aria-label={name ? `Se deschide ${name}` : 'Se deschide aplicația'} // TODO: i18n
    >
      <div ref={surfaceRef} className={styles.surface} />
      <div ref={iconRef} className={styles.icon}>
        <AppIcon app={app} size={64} title={name} />
      </div>
    </div>
  );
}
