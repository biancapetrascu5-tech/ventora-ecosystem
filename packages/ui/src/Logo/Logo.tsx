import { useId } from 'react';
import { cn } from '../lib/cn';
import { LOGO_SVG } from './logos';
import styles from './Logo.module.css';

export interface LogoProps {
  /**
   * full = semnul + „VENTORA SYSTEMS” pe un rând; stacked = pe două rânduri („SYSTEMS” mai mic,
   * centrat; sub 32px, varianta mică, ca să rămână lizibil); mark = doar semnul.
   */
  variant?: 'full' | 'stacked' | 'mark';
  /** Înălțimea semnului în px (logo-ul păstrează proporțiile fișierului). */
  size?: number;
  /** Numele accesibil (numele mărcii); gol = decorativ (aria-hidden). */
  title?: string;
  className?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/* Logo 3.1.0 din bundle.js (MARCA-1): două desene, light și dark (varianta B, cu tăieturi prin
   mască), afișate după tema cea mai apropiată (--v-logo-light / --v-logo-dark din tokens.css).
   Fiecare instanță are id-ul ei de mască, ca mai multe logo-uri pe pagină să nu împartă una. */
export function Logo({
  variant = 'full',
  size = 32,
  title = 'Ventora Systems',
  className,
}: LogoProps) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const stacked = variant === 'stacked';
  const full = variant === 'full' || stacked;
  const h = full ? Math.round((size * 68) / 60) : size;
  const w = Math.round(full ? (h * (stacked ? 250 : 415)) / 68 : (size * 360) / 392);
  const small = stacked && size < 32;
  const svg = (s: string) =>
    s
      .replace(
        ' role="img" aria-label="Ventora Systems"',
        (title ? ` role="img" aria-label="${esc(title)}"` : ' focusable="false"') +
          ` width="${w}" height="${h}"`,
      )
      .replace(/ventora-(mark|logo|logo-stacked|logo-stacked-small)-dark-cut/g, `$&-${uid}`);
  const [light, dark] = small
    ? [LOGO_SVG.stackedSmallLight, LOGO_SVG.stackedSmallDark]
    : stacked
      ? [LOGO_SVG.stackedLight, LOGO_SVG.stackedDark]
      : full
        ? [LOGO_SVG.logoLight, LOGO_SVG.logoDark]
        : [LOGO_SVG.markLight, LOGO_SVG.markDark];
  return (
    <span
      className={cn(styles.logo, className)}
      style={{ width: w, height: h }}
      aria-hidden={title ? undefined : 'true'}
    >
      <span
        className={cn(styles.img, styles.light)}
        dangerouslySetInnerHTML={{ __html: svg(light) }}
      />
      <span
        className={cn(styles.img, styles.dark)}
        dangerouslySetInnerHTML={{ __html: svg(dark) }}
      />
    </span>
  );
}
