'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './ThemeContext';

interface VentoraProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export function VentoraProvider({ children, defaultTheme = 'auto' }: VentoraProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined' &&
      localStorage.getItem('vt-theme')) as Theme | null;
    if (stored && ['light', 'dark', 'auto'].includes(stored)) {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const resolve = () => {
      setResolvedTheme(theme === 'auto' ? (mq.matches ? 'dark' : 'light') : theme);
    };
    resolve();
    if (theme === 'auto') {
      mq.addEventListener('change', resolve);
      return () => mq.removeEventListener('change', resolve);
    }
    return undefined;
  }, [theme]);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'auto') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem('vt-theme', next);
    } catch {
      // ignore
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
