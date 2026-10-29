import { cn } from '../lib/cn';
import { LOGO_SVG } from './logos';
import styles from './Logo.module.css';

export interface LogoProps {
  /** full = marca + „Ventora”; mark = doar marca. */
  variant?: 'full' | 'mark';
  /** Înălțimea mărcii în px (la full, logo-ul e puțin mai înalt, ca în bundle). */
  size?: number;
  /** Numele accesibil (numele mărcii); gol = decorativ (aria-hidden). */
  title?: string;
  className?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/* Logo din bundle.js. În bundle stau două SVG-uri (light / dark) comutate de data-theme; aici e
   unul singur, cu culorile light-dark() (logos.ts), deci urmează tema locului fără CSS global. */
export function Logo({ variant = 'full', size = 32, title = 'Ventora', className }: LogoProps) {
  const full = variant === 'full';
  const h = full ? Math.round((size * 68) / 60) : size;
  const w = Math.round(full ? (h * 250) / 68 : (size * 360) / 392);
  const svg = LOGO_SVG[full ? 'full' : 'mark'].replace(
    ' role="img" aria-label="Ventora"',
    (title ? ` role="img" aria-label="${esc(title)}"` : ' focusable="false"') +
      ` width="${w}" height="${h}"`,
  );
  return (
    <span
      className={cn(styles.logo, className)}
      style={{ width: w, height: h }}
      aria-hidden={title ? undefined : 'true'}
    >
      <span className={styles.img} dangerouslySetInnerHTML={{ __html: svg }} />
    </span>
  );
}
