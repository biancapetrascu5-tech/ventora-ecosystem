'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Kbd.module.css';

/* eslint-disable i18next/no-literal-string -- key names are not translated */
function renderKey(k: string, mac: boolean) {
  switch (k) {
    case 'mod':
      return mac ? <Icon icon="command" size={12} label="Command" /> : 'Ctrl';
    case 'shift':
      return 'Shift';
    case 'enter':
      return <Icon icon="corner-down-left" size={12} label="Enter" />;
    case 'up':
      return <Icon icon="arrow-up" size={12} label="Up" />;
    case 'down':
      return <Icon icon="arrow-down" size={12} label="Down" />;
    default:
      return k;
  }
}
/* eslint-enable i18next/no-literal-string */

export interface KbdProps {
  /** Strings plus the tokens `mod`, `shift`, `enter`, `up`, `down`. */
  keys: string[];
  className?: string;
}

export function Kbd({ keys, className }: KbdProps) {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform ?? ''));
  }, []);
  return (
    <span className={cn(styles.root, className)}>
      {keys.map((k, i) => (
        <kbd key={i} className={cn(styles.key, 'caption')}>
          {renderKey(k, mac)}
        </kbd>
      ))}
    </span>
  );
}
