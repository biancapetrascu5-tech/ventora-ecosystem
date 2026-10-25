import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Web APIs absent from jsdom that react-aria-components needs
if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  }
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      root: null,
      rootMargin: '',
      thresholds: [],
      takeRecords: () => [],
    })) as unknown as typeof IntersectionObserver;
  }
  const cssEscape = (v: string) => v.replace(/[^\w-]/g, (c) => `\\${c}`);
  if (typeof window.CSS === 'undefined' || window.CSS === null) {
    Object.defineProperty(window, 'CSS', {
      value: { supports: () => false, escape: cssEscape },
      writable: true,
    });
  } else {
    if (typeof window.CSS.escape === 'undefined') {
      try {
        Object.defineProperty(window.CSS, 'escape', { value: cssEscape, writable: true });
      } catch {
        /* read-only property in some envs */
      }
    }
  }
}
