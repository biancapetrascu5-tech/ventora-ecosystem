'use client';

import { SegmentedControl } from '../SegmentedControl/SegmentedControl';

export type ThemeChoice = 'light' | 'dark' | 'system';

export interface ThemeSwitcherLabels {
  /** S.theme — eticheta grupului. */
  theme: string;
  /** S.themeLight / S.themeDark / S.themeSystem. */
  light: string;
  dark: string;
  system: string;
}

export interface ThemeSwitcherProps {
  value?: ThemeChoice;
  defaultValue?: ThemeChoice;
  onChange?: (theme: ThemeChoice) => void;
  /** Doar iconițe (soare, lună, monitor); textul devine aria-label. */
  iconOnly?: boolean;
  size?: 'sm' | 'md';
  block?: boolean;
  labels: ThemeSwitcherLabels;
  className?: string;
}

/* ThemeSwitcher din bundle.js: SegmentedControl Luminoasă / Întunecată / Automată. */
export function ThemeSwitcher({
  value,
  defaultValue,
  onChange,
  iconOnly,
  size = 'md',
  block,
  labels,
  className,
}: ThemeSwitcherProps) {
  return (
    <SegmentedControl
      className={className}
      aria-label={labels.theme}
      size={size}
      block={block}
      iconOnly={iconOnly}
      value={value}
      defaultValue={defaultValue}
      onChange={(v) => onChange?.(v as ThemeChoice)}
      options={[
        { value: 'light', label: labels.light, icon: 'sun' },
        { value: 'dark', label: labels.dark, icon: 'moon' },
        { value: 'system', label: labels.system, icon: 'monitor' },
      ]}
    />
  );
}
