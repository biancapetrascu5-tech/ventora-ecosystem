'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

export type Placement = 'bottom-start' | 'bottom-end';

/* useAnchor din bundle.js: poziție fixă sub ancoră, întoarsă deasupra dacă nu încape,
   ținută în fereastră; se actualizează la derulare și redimensionare. */
export function useAnchor(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  {
    placement = 'bottom-start',
    offset = 6,
    matchWidth = false,
  }: {
    placement?: Placement;
    offset?: number;
    matchWidth?: boolean;
  } = {},
) {
  const [pos, setPos] = useState<{ top: number; left: number; width?: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const update = useCallback(() => {
    const a = anchor.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const p = popRef.current;
    const pw = p ? p.offsetWidth : 0;
    const ph = p ? p.offsetHeight : 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const above = r.bottom + offset + ph > vh && r.top - offset - ph > 0;
    let top = above ? r.top - offset - ph : r.bottom + offset;
    let left = placement === 'bottom-end' ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, vw - pw - 8));
    top = Math.max(8, Math.min(top, vh - ph - 8));
    setPos({ top, left, width: matchWidth ? r.width : undefined });
  }, [anchor, placement, offset, matchWidth]);
  useLayoutEffect(() => {
    if (!open) return;
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);
  const style: CSSProperties = pos
    ? { top: pos.top, left: pos.left, minWidth: pos.width }
    : { top: -9999, left: -9999 };
  return { popRef, style };
}

/* useOutside din bundle.js: închide la apăsare în afara ancorei și a listei. */
export function useOutside(
  refs: RefObject<HTMLElement | null>[],
  handler: () => void,
  active: boolean,
) {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    if (!active) return;
    const on = (e: Event) => {
      const t = e.target as Node;
      for (const r of refs) if (r.current?.contains(t)) return;
      h.current();
    };
    document.addEventListener('mousedown', on);
    document.addEventListener('touchstart', on);
    return () => {
      document.removeEventListener('mousedown', on);
      document.removeEventListener('touchstart', on);
    };
    // refs sunt obiecte stabile (useRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/* Portal din bundle.js: lista ia tema locului din care se deschide (.v-portal-theme). */
export function ThemedPortal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement?.closest('[data-theme]');
    setTheme(el && el !== document.documentElement ? el.getAttribute('data-theme') : null);
    setMounted(true);
  }, []);
  return (
    <>
      <span ref={ref} hidden />
      {mounted &&
        createPortal(
          theme ? (
            <div data-theme={theme} className="v-portal-theme" style={{ display: 'contents' }}>
              {children}
            </div>
          ) : (
            children
          ),
          document.body,
        )}
    </>
  );
}
