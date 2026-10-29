/* Apelurile ecranelor de autentificare către Better Auth (/api/auth/*, core/identity).
   Fiecare întoarce un rezultat tipizat; ecranele nu citesc niciodată răspunsul brut. */

export type ApiFailure =
  | { kind: 'offline' }
  | { kind: 'rateLimited'; retryAt?: Date }
  | { kind: 'error'; status: number; code?: string };

export type ApiResult<T> = ({ ok: true } & T) | ({ ok: false } & ApiFailure);

const BASE = '/api/auth';

async function post<T>(path: string, body: unknown): Promise<ApiResult<{ data: T }>> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, kind: 'offline' };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) return { ok: true, data: (json ?? {}) as T };
  if (res.status === 429) {
    // R-PR4 trimite `retryAt`; limita pe IP a Better Auth trimite doar X-Retry-After (secunde).
    const retryAt =
      typeof json?.retryAt === 'string'
        ? new Date(json.retryAt)
        : res.headers.get('X-Retry-After')
          ? new Date(Date.now() + Number(res.headers.get('X-Retry-After')) * 1000)
          : undefined;
    return { ok: false, kind: 'rateLimited', retryAt, ...codeOf(json) } as ApiResult<{
      data: T;
    }>;
  }
  return { ok: false, kind: 'error', status: res.status, ...codeOf(json) };
}

function codeOf(json: Record<string, unknown> | null): { code?: string } {
  return typeof json?.code === 'string' ? { code: json.code } : {};
}

/* ── Intrare ── */

export type SignInData = { twoFactorRedirect?: boolean; user?: { id: string; email: string } };

export function signIn(email: string, password: string, rememberMe: boolean) {
  return post<SignInData>('/sign-in/email', { email, password, rememberMe });
}

export function signOut() {
  return post<unknown>('/sign-out', {});
}

/* ── Autentificarea în doi pași ── */

export function enableTwoFactor(password: string) {
  return post<{ totpURI: string; backupCodes: string[] }>('/two-factor/enable', { password });
}

export function verifyTotp(code: string) {
  return post<unknown>('/two-factor/verify-totp', { code });
}

export function verifyBackupCode(code: string) {
  return post<unknown>('/two-factor/verify-backup-code', { code });
}

/* ── Parolă nouă (R-PR3…R-PR7) ── */

export function requestPasswordReset(email: string) {
  return post<unknown>('/request-password-reset', { email, redirectTo: '/reset-password' });
}

export function resetPassword(token: string, newPassword: string) {
  return post<unknown>('/reset-password', { token, newPassword });
}

export function requestNewResetLink(token: string) {
  return post<{ status: 'link_sent' | 'forgot_password' }>('/request-new-reset-link', { token });
}

/** Codurile de eroare Better Auth pentru o parolă care nu trece politica (minimum 10, cifră, majusculă). */
export function isPasswordPolicyError(code?: string): boolean {
  return !!code && /PASSWORD/.test(code) && code !== 'INVALID_PASSWORD';
}
