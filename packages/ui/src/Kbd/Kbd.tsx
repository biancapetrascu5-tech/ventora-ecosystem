'use client';

import { cn } from '../lib/cn';
import styles from './Kbd.module.css';

const MAC_LABELS: Record<string, string> = {
  mod: '⌘',
  shift: '⇧',
  alt: '⌥',
  ctrl: '⌃',
  enter: '↵',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  esc: 'Esc',
  backspace: '⌫',
  delete: '⌦',
  tab: '⇥',
};

const WIN_LABELS: Record<string, string> = {
  mod: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Ctrl',
  enter: 'Enter',
  esc: 'Esc',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

function resolveKey(key: string): string {
  const lower = key.toLowerCase();
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')) {
    return MAC_LABELS[lower] ?? key;
  }
  return WIN_LABELS[lower] ?? key;
}

export interface KbdProps {
  keys: string[];
  className?: string;
}

export function Kbd({ keys, className }: KbdProps) {
  return (
    <span className={cn(styles.combo, className)} aria-label={keys.join('+')}>
      {keys.map((k, i) => (
        <kbd key={i} className={styles.key}>
          {resolveKey(k)}
        </kbd>
      ))}
    </span>
  );
}
