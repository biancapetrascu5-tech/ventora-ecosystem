'use client';

import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import type { Placement } from '../lib/popover';
import { Menu } from '../Menu/Menu';
import btn from '../Button/Button.module.css';
import ib from '../IconButton/IconButton.module.css';
import styles from './LanguageSwitcher.module.css';

/** Limbile platformei, cu numele în limba lor (LOCALES din bundle.js). */
export const LOCALES = [
  { code: 'ro', name: 'Română' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
] as const;

export type LocaleCode = (typeof LOCALES)[number]['code'];

export interface LanguageSwitcherProps {
  value?: string;
  onChange?: (code: string) => void;
  /** `button` = glob + numele limbii + chevron; `icon` = doar globul. */
  variant?: 'button' | 'icon';
  placement?: Placement;
  defaultOpen?: boolean;
  /** S.language — eticheta meniului și a butonului. */
  label: string;
  className?: string;
}

/* LanguageSwitcher din bundle.js: Menu cu cele 6 limbi, cea curentă bifată. */
export function LanguageSwitcher({
  value = 'ro',
  onChange,
  variant = 'button',
  placement = 'bottom-end',
  defaultOpen,
  label,
  className,
}: LanguageSwitcherProps) {
  const current = LOCALES.find((l) => l.code === value) ?? LOCALES[0];
  return (
    <Menu
      label={label}
      placement={placement}
      defaultOpen={defaultOpen}
      items={LOCALES.map((l) => ({ id: l.code, label: l.name, checked: l.code === value }))}
      onAction={(code) => onChange?.(code)}
    >
      {variant === 'icon' ? (
        <button
          type="button"
          className={cn(ib.root, ib.md, ib.quiet, styles.hover, className)}
          aria-label={`${label}: ${current.name}`}
          title={label}
        >
          <Icon icon="globe" size={16} />
        </button>
      ) : (
        <button
          type="button"
          className={cn(btn.root, btn.quiet, btn.md, styles.hover, className)}
          aria-label={`${label}: ${current.name}`}
        >
          <Icon icon="globe" size={16} />
          <span className={cn(btn.label, 'body-strong')}>{current.name}</span>
          <Icon icon="chevron-down" size={14} />
        </button>
      )}
    </Menu>
  );
}
