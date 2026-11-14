/* BookingMoney: the pure part — the amount typed in „Încasează” / „Rambursează…” and the limits
   the dialogs check before calling the server (which checks them again: the appointment's
   balance, appointment_payment_guard). No React, no texts. */

/** „200”, „200,5”, „200.50” → 20050 (minor units); anything else → null. */
export function minorOf(text: string): number | null {
  const v = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** 20050 → „200,5”, 20000 → „200”: the amount as the input shows it. */
export function amountInput(minor: number): string {
  return String(minor / 100).replace('.', ',');
}

/** At most what is left of the payment and never more than the appointment's net. */
export function refundMax(p: { amountMinor: number; refundedMinor: number }, netMinor: number) {
  return Math.max(0, Math.min(p.amountMinor - p.refundedMinor, netMinor));
}

export type CollectCheck = { ok: true; minor: number } | { ok: false; error: 'amount' | 'max' };

/** „Încasează”: more than 0; at a fixed price, not more than what is still due. */
export function checkCollect(text: string, outstandingMinor: number | null): CollectCheck {
  const minor = minorOf(text);
  if (!minor || minor < 1) return { ok: false, error: 'amount' };
  if (outstandingMinor !== null && minor > outstandingMinor) return { ok: false, error: 'max' };
  return { ok: true, minor };
}
