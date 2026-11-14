'use client';

import { useEffect, useRef } from 'react';

/* The anti-robot check of the public booking page (S116-D2, D-B-6): Cloudflare Turnstile, loaded
   from Cloudflare's script (no npm package), rendered inside the neutral slot of the design. The
   token goes to startPublicBooking, which verifies it on the server with TURNSTILE_SECRET_KEY.
   The site key is public (NEXT_PUBLIC_TURNSTILE_SITE_KEY, set by the founder in Vercel); without
   it nothing is rendered and the page shows the slot's error. */

type Turnstile = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      language?: string;
      theme?: 'auto' | 'light' | 'dark';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export function TurnstileWidget(p: {
  lang: string;
  onToken: (token: string | null) => void;
  /** A new value resets the widget (after a refused attempt, the token is single-use). */
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const onToken = useRef(p.onToken);
  useEffect(() => {
    onToken.current = p.onToken;
  });

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    let live = true;
    load()
      .then(() => {
        if (!live || !box.current || !window.turnstile) return;
        id.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: p.lang,
          theme: 'auto',
          callback: (token) => onToken.current(token),
          'expired-callback': () => onToken.current(null),
          'error-callback': () => onToken.current(null),
        });
      })
      .catch(() => onToken.current(null));
    return () => {
      live = false;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, [p.lang]);

  useEffect(() => {
    if (p.resetKey && id.current && window.turnstile) window.turnstile.reset(id.current);
  }, [p.resetKey]);

  return <div ref={box} />;
}
