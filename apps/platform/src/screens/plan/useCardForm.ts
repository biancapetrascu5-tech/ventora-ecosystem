'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { confirmCardForm, mountCardForm, type CardForm } from '@/billing/stripe-client';
import { confirmCard, startCard } from '@/server/billing-actions';

/* Lotul 3.7 — câmpul de card al Stripe (Payment Element) într-un StripeSlot: SetupIntent-ul din
   `startCard()`, montarea câmpului când containerul apare, apoi „salvează” = confirmarea în
   Stripe (cu 3-D Secure, dacă banca îl cere) + `confirmCard()`. Datele cardului nu trec prin
   Ventora Systems (§8.6). */

type Locale = 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';

export function useCardForm(active: boolean, publishableKey: string | null) {
  const locale = useLocale() as Locale;
  const container = useRef<HTMLDivElement | null>(null);
  const form = useRef<{ card: CardForm; setupIntentId: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || !publishableKey) return;
    let cancelled = false;
    void (async () => {
      const setup = await startCard();
      if (cancelled) return;
      if (!setup.ok || !container.current) {
        setFailed(true);
        return;
      }
      try {
        const card = await mountCardForm(
          publishableKey,
          setup.clientSecret,
          container.current,
          locale,
        );
        if (cancelled) {
          card.unmount();
          return;
        }
        form.current = { card, setupIntentId: setup.setupIntentId };
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      form.current?.card.unmount();
      form.current = null;
    };
  }, [active, publishableKey, locale]);

  /** Salvează cardul scris în câmp; `false` dacă Stripe sau banca l-au refuzat. */
  async function save(): Promise<boolean> {
    const f = form.current;
    if (!f) return false;
    const confirmed = await confirmCardForm(f.card);
    if ('error' in confirmed) return false;
    const saved = await confirmCard(confirmed.setupIntentId);
    return saved.ok && saved.card !== null;
  }

  return { container, save, failed: failed || !publishableKey };
}
