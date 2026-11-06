import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_APPLICATIONS,
  initialSupportApplication,
  supportApplicationFor,
  supportHref,
} from '../apps';

/*
 * Lotul 4.11, criteriul de ieșire 4 (FAZA-4 §8): „Suport” din AccountMenu, din orice pagină a
 * Hub-ului, deschide formularul cu aplicația paginii precompletată. Rutele se citesc din
 * `apps/platform/app/(hub)`, deci o pagină nouă intră singură în test.
 */
const HUB = fileURLToPath(new URL('../../../../apps/platform/app/(hub)', import.meta.url));

function hubRoutes(dir = HUB, prefix = ''): string[] {
  const out = existsSync(join(dir, 'page.tsx')) ? [prefix || '/'] : [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const segment = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`;
    out.push(...hubRoutes(join(dir, entry.name), prefix + segment));
  }
  return out;
}

/** Rutele cu segmente dinamice, cu valori reale ([app]: fiecare aplicație și una necunoscută). */
function concrete(route: string): string[] {
  if (route.includes('[app]')) {
    return [...SUPPORT_APPLICATIONS, 'nu-exista'].map((id) => route.replace('[app]', id));
  }
  return [route.replace(/\[[^\]]+\]/g, 'VS-1042')];
}

/** Ce vede formularul: `?app=` din link → aplicația cererii noi. */
function formApplication(href: string) {
  return initialSupportApplication(new URL(href, 'https://hub.test').searchParams.get('app'));
}

describe('criteriul 4 — suportul din orice pagină a Hub-ului', () => {
  const routes = hubRoutes();

  it('găsește paginile Hub-ului (launcher, cont, administrare, catalog, suport)', () => {
    for (const r of [
      '/',
      '/account',
      '/admin/team',
      '/applications/[app]',
      '/catalog',
      '/support',
    ]) {
      expect(routes).toContain(r);
    }
  });

  it('din fiecare pagină, formularul are aplicația paginii (sau Hub), niciodată una necunoscută', () => {
    for (const path of routes.flatMap(concrete)) {
      const href = supportHref(path);
      if (path === '/support' || path.startsWith('/support/')) {
        expect(href, path).toBe('/support');
        continue;
      }
      expect(href.startsWith('/support?app='), path).toBe(true);
      expect(formApplication(href), path).toBe(supportApplicationFor(path));
    }
  });

  it('din pagina unei aplicații din catalog, aplicația ei; din rest, Hub (platform)', () => {
    for (const id of SUPPORT_APPLICATIONS.filter((a) => a !== 'platform')) {
      expect(formApplication(supportHref(`/applications/${id}`))).toBe(id);
    }
    expect(formApplication(supportHref('/applications/nu-exista'))).toBe('platform');
    expect(formApplication(supportHref('/admin/team'))).toBe('platform');
  });

  it('un ?app= străin (scris de mână în adresă) nu ajunge în formular', () => {
    expect(initialSupportApplication('nu-exista')).toBe('platform');
    expect(initialSupportApplication('<script>')).toBe('platform');
    expect(initialSupportApplication(null)).toBe('platform');
    expect(initialSupportApplication(undefined)).toBe('platform');
    expect(initialSupportApplication('booking')).toBe('booking');
  });
});
