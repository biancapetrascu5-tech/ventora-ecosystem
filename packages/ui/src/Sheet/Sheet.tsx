'use client';

import { cn } from '../lib/cn';
import styles from './Sheet.module.css';

export interface SheetProps {
  children: React.ReactNode;
  className?: string;
}

export interface SheetSectionProps {
  children: React.ReactNode;
  className?: string;
}

export function Sheet({ children, className }: SheetProps) {
  return <div className={cn(styles.sheet, className)}>{children}</div>;
}

export function SheetSection({ children, className }: SheetSectionProps) {
  return <div className={cn(styles.sheetSection, className)}>{children}</div>;
}
