import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import styles from './GrowthSlot.module.css';

export interface GrowthSlotProps {
  /** Conținutul (ex. RecommendationCard); fără el, locul nu se desenează deloc. */
  children?: ReactNode;
  /** Numele accesibil al zonei. */
  label?: string;
  className?: string;
}

/* GrowthSlot din bundle.js: locul unei recomandări în pagină; apare cu o deschidere scurtă
   și dispare fără urmă când nu are conținut. */
export function GrowthSlot({ children, label, className }: GrowthSlotProps) {
  if (!children) return null;
  return (
    <div className={cn(styles.slot, className)} aria-label={label}>
      <div className={styles.in}>{children}</div>
    </div>
  );
}
