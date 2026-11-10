import { InvalidInput } from '@ventora/errors';
import { isValidCui } from './validation';

/*
 * Lot CR.2 — completing a company from its CUI through the public ANAF lookup (S130: „da,
 * acum”). The answer only fills the form; nothing is stored here. The ANAF service is public
 * (no key), POST with [{ cui, data }]; it answers within seconds or not at all, so the lookup
 * has a 5 s limit and every failure is „unavailable” (the form stays filled by hand).
 *
 * DE VALIDAT TEHNIC: the address of the service changes with its version (v8 → v9); it is
 * configurable (ANAF_TVA_URL) and the answer is read defensively.
 */

export const ANAF_TVA_URL_DEFAULT = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';
const TIMEOUT_MS = 5000;

export type AnafCompany = {
  taxId: string;
  name: string;
  address: string | null;
  phone: string | null;
  /** Registered for VAT on the day of the lookup (the CUI is then written with RO). */
  vatPayer: boolean;
};

export type AnafLookup =
  { status: 'found'; company: AnafCompany } | { status: 'not_found' } | { status: 'unavailable' };

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

let fetcher: FetchLike = (url, init) => fetch(url, init);

/** Tests replace the network; null puts the real fetch back. */
export function setAnafFetch(f: FetchLike | null): void {
  fetcher = f ?? ((url, init) => fetch(url, init));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const str = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null;

export async function lookupCompanyByCui(value: unknown): Promise<AnafLookup> {
  if (typeof value !== 'string') throw new InvalidInput('taxId', 'invalid');
  const digits = value.replace(/\s+/g, '').toUpperCase().replace(/^RO/, '');
  if (!isValidCui(digits)) throw new InvalidInput('taxId', 'invalid');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(process.env.ANAF_TVA_URL || ANAF_TVA_URL_DEFAULT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui: Number(digits), data: today() }]),
      signal: controller.signal,
    });
    if (!res.ok) return { status: 'unavailable' };
    const body = (await res.json()) as {
      found?: Array<{
        date_generale?: Record<string, unknown>;
        inregistrare_scop_Tva?: { scpTVA?: unknown };
      }>;
      notFound?: unknown[];
    };
    const found = body.found?.[0];
    const general = found?.date_generale;
    const name = str(general?.denumire);
    if (!found || !general || !name) {
      return Array.isArray(body.notFound) ? { status: 'not_found' } : { status: 'unavailable' };
    }
    const vatPayer = found.inregistrare_scop_Tva?.scpTVA === true;
    return {
      status: 'found',
      company: {
        taxId: vatPayer ? `RO${digits}` : digits,
        name,
        address: str(general.adresa),
        phone: str(general.telefon),
        vatPayer,
      },
    };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
