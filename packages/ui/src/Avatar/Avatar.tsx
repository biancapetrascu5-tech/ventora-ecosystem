'use client';

import { cn } from '../lib/cn';
import { StatusDot } from '../StatusDot/StatusDot';
import type { StatusDotTone } from '../StatusDot/StatusDot';
import styles from './Avatar.module.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'done' | 'attention' | 'offline';

const AVATAR_PALETTES = [
  '#5C6BC0',
  '#EC407A',
  '#26A69A',
  '#FFA726',
  '#AB47BC',
  '#29B6F6',
  '#66BB6A',
  '#EF5350',
  '#8D6E63',
  '#78909C',
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_DOT_TONE: Record<AvatarStatus, StatusDotTone> = {
  done: 'done',
  attention: 'attention',
  offline: 'offline',
};

export interface AvatarProps {
  name: string;
  src?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  shape?: 'circle' | 'square';
  className?: string;
}

export function Avatar({
  name,
  src,
  size = 'md',
  status,
  shape = 'circle',
  className,
}: AvatarProps) {
  return (
    <span
      className={cn(styles.root, styles[size], shape === 'square' && styles.square, className)}
      title={name}
      aria-label={name}
      role="img"
    >
      {src ? (
        <img src={src} alt={name} className={styles.img} />
      ) : (
        <span className={styles.initials} style={{ background: nameToColor(name) }} aria-hidden>
          {initials(name)}
        </span>
      )}
      {status && (
        <StatusDot tone={STATUS_DOT_TONE[status]} className={styles.status} label={status} />
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
  className?: string;
}

export function AvatarGroup({ people, max = 5, size = 'sm', className }: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const overflow = people.length - max;
  return (
    <span className={cn(styles.group, className)} aria-label={`${people.length} persoane`}>
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} src={p.src} size={size} className={styles.groupItem} />
      ))}
      {overflow > 0 && (
        <span className={cn(styles.overflow, styles[size])} aria-hidden>
          +{overflow}
        </span>
      )}
    </span>
  );
}
