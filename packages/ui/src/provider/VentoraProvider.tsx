'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './ThemeContext';
import { _registerToastDispatch, type ToastOptions } from '../hooks/useToast';
import { Toast, type ToastTone } from '../Toast/Toast';

interface VentoraProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

interface ActiveToast extends ToastOptions {
  id: number;
}

let _toastId = 0;

export function VentoraProvider({ children, defaultTheme = 'auto' }: VentoraProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

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

  useEffect(() => {
    return _registerToastDispatch((opts: ToastOptions) => {
      const id = ++_toastId;
      setToasts((prev) => [...prev, { ...opts, id }]);
      const duration = opts.duration ?? 4000;
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    });
  }, []);

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
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 'var(--space-6)',
            right: 'var(--space-6)',
            width: 'var(--panel-width, 360px)',
            zIndex: 'var(--z-toast)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            pointerEvents: 'none',
          }}
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <div key={t.id} style={{ pointerEvents: 'auto' }}>
              <Toast
                tone={(t.variant === 'info' ? 'neutral' : t.variant) as ToastTone | undefined}
                title={t.message}
                onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              />
            </div>
          ))}
        </div>
      )}
    </ThemeContext.Provider>
  );
}
