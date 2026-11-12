/* HubEmpty · S146 (lotul 5.1c): stările foii „Cere acces”, ca în preview.html (EmptyBody146). */

export type AccessRequestState = 'idle' | 'sending' | 'sent' | 'resend' | 'error' | 'suspended';

/** Starea la încărcare: n-a cerut; a cerut și încă nu au trecut 7 zile; o poate trimite din nou. */
export function requestStateOf(
  request: { canResendAt: string } | null,
  now: string,
): AccessRequestState {
  if (!request) return 'idle';
  return Date.parse(request.canResendAt) > Date.parse(now) ? 'sent' : 'resend';
}
