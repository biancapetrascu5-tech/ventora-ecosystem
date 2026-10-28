'use client';

import { Badge } from '../Badge/Badge';
import { cn } from '../lib/cn';
import styles from './RecommendationLabel.module.css';

export interface RecommendationLabelProps {
  /** S.recommendation, ex. „Recomandare”. */
  label: string;
  className?: string;
}

/* RecommendationLabel din bundle.js: Badge neutru „Recomandare”. */
export function RecommendationLabel({ label, className }: RecommendationLabelProps) {
  return (
    <Badge tone="neutral" className={cn(styles.label, className)}>
      {label}
    </Badge>
  );
}
