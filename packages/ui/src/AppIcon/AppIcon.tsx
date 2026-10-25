'use client';

import { cn } from '../lib/cn';
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

export interface AppIconProps {
  app: AppName;
  size?: number;
  muted?: boolean;
  dark?: boolean;
  title?: string;
  basePath?: string;
  className?: string;
}

export function AppIcon({
  app,
  size = 44,
  muted = false,
  dark = false,
  title,
  basePath = '/app-icons/',
  className,
}: AppIconProps) {
  const suffix = `${muted ? '-inactive' : ''}${dark ? '-dark' : ''}`;
  const src = `${basePath}${app}${suffix}.svg`;
  const borderRadius = Math.round(12 * (size / 48));

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={title ?? ''}
      aria-hidden={!title || undefined}
      className={cn(styles.root, className)}
      style={{ width: size, height: size, display: 'block', borderRadius }}
      draggable={false}
    />
  );
}
