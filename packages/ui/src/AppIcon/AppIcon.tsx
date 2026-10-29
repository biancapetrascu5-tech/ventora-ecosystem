'use client';

import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { APP_GLYPHS, APPS } from './glyphs';
import styles from './AppIcon.module.css';

export type AppName =
  | 'booking'
  | 'crm'
  | 'hr'
  | 'finance'
  | 'projects'
  | 'shifts'
  | 'documents'
  | 'portal'
  | 'inventory'
  | 'analytics'
  | 'marketing'
  | 'network'
  | 'contracts'
  | 'events'
  | 'assets';

export { APPS };

/** Aplicațiile cu glifă, în ordinea din bundle (AppIcon.apps). */
export const APP_IDS = Object.keys(APP_GLYPHS) as AppName[];

export interface AppIconProps {
  /** Fără `app` (sau fără glifă) se desenează iconița Lucide pe plăcuță. */
  app?: AppName | string;
  /** Iconița Lucide pentru o aplicație fără glifă (implicit APPS[app].icon, apoi layout-grid). */
  icon?: IconName;
  size?: number;
  /** Aplicație indisponibilă: placă și forme estompate. */
  muted?: boolean;
  /** Numele aplicației pentru cititorul de ecran; fără el iconița e decorativă. */
  title?: string;
  className?: string;
}

/* AppIcon din bundle.js: SVG 48×48 cu placa (appicon-plate), forma și accentul aplicației;
   culorile vin din tokeni, deci tema se schimbă singură. */
export function AppIcon({ app, icon, size = 40, muted = false, title, className }: AppIconProps) {
  const glyph = app ? APP_GLYPHS[app] : undefined;
  if (!glyph) {
    const ic = (icon ??
      ((app && APPS[app]?.icon) as IconName | undefined) ??
      'layout-grid') as IconName;
    return (
      <span
        className={cn(styles.appicon, styles.lucide, muted && styles.isMuted, className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Icon icon={ic} size={Math.round(size * 0.5)} strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <svg
      className={cn(styles.svg, muted && styles.isMuted, className)}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
      dangerouslySetInnerHTML={{
        __html:
          '<rect class="v-ag-plate" width="48" height="48" rx="12"/><rect class="v-ag-edge" x="0.5" y="0.5" width="47" height="47" rx="11.5"/>' +
          glyph,
      }}
    />
  );
}
