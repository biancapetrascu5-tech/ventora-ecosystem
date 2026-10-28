'use client';

import type React from 'react';
import { cn } from '../lib/cn';
import { fmtNumber } from '../lib/fmt';
import type { StatusDotTone } from '../StatusDot/StatusDot';
import styles from './Avatar.module.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = StatusDotTone;

const AV: Record<AvatarSize, number> = { xs: 20, sm: 24, md: 32, lg: 40, xl: 56 };

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return p.length ? ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() : '';
}

type AvatarStyle = React.CSSProperties & { '--avatar-font': string };

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: AvatarSize;
  shape?: 'circle' | 'square';
  status?: AvatarStatus;
  className?: string;
}

export function Avatar({
  name = '',
  src,
  size = 'md',
  shape = 'circle',
  status,
  className,
}: AvatarProps) {
  const px = AV[size];
  const style: AvatarStyle = {
    width: px,
    height: px,
    '--avatar-font': `${Math.round(px * 0.38)}px`,
  };
  return (
    <span
      className={cn(styles.root, styles[shape], className)}
      style={style}
      role="img"
      aria-label={name}
    >
      {src ? (
        <img src={src} alt="" />
      ) : (
        <span className={styles.ini} aria-hidden="true">
          {initials(name)}
        </span>
      )}
      {status && (
        <span className={cn(styles.status, styles[status])} aria-hidden="true">
          <span className={styles.dot} />
        </span>
      )}
    </span>
  );
}

export interface AvatarGroupPerson {
  name: string;
  src?: string;
}

export interface AvatarGroupProps {
  people: AvatarGroupPerson[];
  max?: number;
  size?: AvatarSize;
  locale?: string;
  className?: string;
}

export function AvatarGroup({ people, max = 4, size = 'sm', locale, className }: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const px = AV[size];
  const moreStyle: AvatarStyle = {
    width: px,
    height: px,
    '--avatar-font': `${Math.round(px * 0.36)}px`,
  };
  return (
    <span
      className={cn(styles.group, className)}
      role="group"
      aria-label={people.map((p) => p.name).join(', ')}
    >
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} src={p.src} size={size} />
      ))}
      {rest > 0 && (
        <span
          className={cn(styles.root, styles.circle, styles.more)}
          style={moreStyle}
          aria-hidden="true"
        >
          <span className={styles.ini}>+{fmtNumber(rest, locale)}</span>
        </span>
      )}
    </span>
  );
}
