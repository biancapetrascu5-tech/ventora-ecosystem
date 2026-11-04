'use client';

import { useThemeContext } from './ThemeContext';
import type { ThemeChoice } from '../ThemeSwitcher/ThemeSwitcher';

export { useThemeContext as useTheme } from './ThemeContext';

/**
 * Tema din VentoraProvider, în forma pe care o așteaptă ThemeSwitcher / AccountMenu
 * („auto” din context = „system” în comutator). Shell-urile o dau mai departe ca props.
 */
export function useThemeChoice(): {
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
} {
  const { theme, setTheme } = useThemeContext();
  return {
    theme: theme === 'auto' ? 'system' : theme,
    onThemeChange: (next) => setTheme(next === 'system' ? 'auto' : next),
  };
}
