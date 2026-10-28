import { describe, expect, it } from 'vitest';
import ro from '../../messages/ro.json';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import es from '../../messages/es.json';
import de from '../../messages/de.json';
import it_ from '../../messages/it.json';
import founderRo from '../../messages/founder/ro.json';
import { CANONICAL_LOCALE, SUPPORTED_LOCALES, type Locale } from '../index';

// Lot 2.5c (§3.5): the support session banners. i18n:check keeps the keys of the 6 Hub catalogs
// identical; this keeps their placeholders identical, so a translation can never drop
// {founderName} or ask for a value the contract does not return.

type Catalog = { support?: { session?: { banner?: unknown } } };
const CATALOGS: Record<Locale, Catalog> = { ro, en, fr, es, de, it: it_ };

// Vite resolves the glob at build time; the cast only gives it a type here.
const founderCatalogFiles = Object.keys(
  (import.meta as unknown as { glob: (pattern: string) => Record<string, unknown> }).glob(
    '../../messages/founder/*.json',
  ),
);

function placeholders(obj: unknown, prefix = ''): Record<string, string[]> {
  if (typeof obj === 'string') {
    return { [prefix]: [...obj.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort() };
  }
  return Object.entries(obj as Record<string, unknown>).reduce(
    (acc, [k, v]) => ({ ...acc, ...placeholders(v, prefix ? `${prefix}.${k}` : k) }),
    {} as Record<string, string[]>,
  );
}

describe('Hub banner: support.session.banner.* in the 6 languages', () => {
  const canonical = placeholders(CATALOGS[CANONICAL_LOCALE].support?.session?.banner);

  it('RO has the keys the Hub screens need, with the contract fields as placeholders', () => {
    expect(canonical).toEqual({
      title: [],
      message: ['expiresAt', 'founderName'],
      readOnly: [],
      reason: ['reason'],
      ticketRef: ['ticketRef'],
      close: [],
      closeConfirm: [],
      closed: [],
    });
  });

  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale}: same placeholders as RO`, () => {
      expect(placeholders(CATALOGS[locale].support?.session?.banner)).toEqual(canonical);
    });
  }
});

describe('Founder banner: founder.support.banner.*, Romanian only, still as keys', () => {
  it('only ro.json exists for the Founder application', () => {
    expect(founderCatalogFiles).toEqual(['../../messages/founder/ro.json']);
  });

  it('has the keys and placeholders of the Founder banner (§3.5)', () => {
    expect(placeholders(founderRo.founder.support.banner)).toEqual({
      title: ['organizationName'],
      expires: ['expiresAt'],
      readOnly: [],
      close: [],
      closeConfirm: ['organizationName'],
      closed: [],
      expired: [],
    });
  });
});
