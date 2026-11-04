/*
 * Lot 4.6 — pure (no database): the applications of a support request, safe for client code
 * (`@ventora/support/apps`, the Hub shell).
 */

/**
 * The applications a request can be about (S-3): the 15 applications and `platform` — „Hub (cont,
 * abonament, echipă)”, filled in when the person starts from the launcher or „Contul tău”.
 * Identifiers only; the names come from i18n (`apps.<id>.name`, D-UX-4).
 */
export const SUPPORT_APPLICATIONS = [
  'platform',
  'booking',
  'crm',
  'hr',
  'finance',
  'projects',
  'shifts',
  'documents',
  'portal',
  'inventory',
  'analytics',
  'marketing',
  'network',
  'contracts',
  'events',
  'assets',
] as const;
export type SupportApplication = (typeof SUPPORT_APPLICATIONS)[number];

export function isSupportApplication(id: string): id is SupportApplication {
  return (SUPPORT_APPLICATIONS as readonly string[]).includes(id);
}

/**
 * HubSupport: the application filled in from the page the person came from (S111, S-3).
 *   /applications/<id> (the application's page in the catalog), /<id>/… (inside an application)
 *   → that application; anything else (the launcher, „Contul tău”, Administrare, the catalog)
 *   → `platform`, „Hub (cont, abonament, echipă)”.
 */
export function supportApplicationFor(pathname: string): SupportApplication {
  const parts = pathname.split(/[?#]/)[0]!.split('/').filter(Boolean);
  const candidate = parts[0] === 'applications' ? parts[1] : parts[0];
  return candidate && candidate !== 'platform' && isSupportApplication(candidate)
    ? candidate
    : 'platform';
}
