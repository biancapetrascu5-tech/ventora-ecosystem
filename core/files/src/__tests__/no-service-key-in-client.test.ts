import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * FAZA-4, Lot 4.7, „Gata când”: the storage's service key is never in the client's code. Guard over
 * the source tree:
 *   - SUPABASE_SERVICE_ROLE_KEY is read only by the server adapter of core/files;
 *   - no NEXT_PUBLIC_ variable (sent to the browser) names a storage or service key;
 *   - no client component ('use client') imports @ventora/files.
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const SKIP = new Set(['node_modules', '.next', '.turbo', 'dist', 'generated', 'private']);
const SOURCE = /\.(ts|tsx|js|mjs|jsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(entry)) out.push(path);
  }
  return out;
}

const files = ['apps', 'packages', 'core', 'modules'].flatMap((d) => walk(join(ROOT, d)));
const rel = (p: string) => relative(ROOT, p).split(sep).join('/');
const isTest = (p: string) => /\/__tests__\//.test(rel(p));
// each file is read once for the three checks (the tree is large: on a loaded machine three full
// reads went past the default 5 s)
const cache = new Map<string, string>();
const text = (p: string) => {
  let t = cache.get(p);
  if (t === undefined) {
    t = readFileSync(p, 'utf8');
    cache.set(p, t);
  }
  return t;
};

describe('no storage service key in the client code (Lot 4.7)', { timeout: 30_000 }, () => {
  it('the tree was found', () => {
    expect(files.some((f) => rel(f) === 'core/files/src/adapters/supabase.ts')).toBe(true);
  });

  it('SUPABASE_SERVICE_ROLE_KEY is read only by the server adapter', () => {
    const readers = files
      .filter((f) => !isTest(f))
      .filter((f) => text(f).includes('SUPABASE_SERVICE_ROLE_KEY'))
      .map(rel);
    expect(readers).toEqual(['core/files/src/adapters/supabase.ts']);
  });

  it('no NEXT_PUBLIC_ variable names a storage or service key', () => {
    const leaks = files
      .filter((f) => !isTest(f))
      .flatMap((f) =>
        [
          ...text(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|STORAGE|BUCKET|SUPABASE)[A-Z0-9_]*/g),
        ].map((m) => `${rel(f)}: ${m[0]}`),
      );
    expect(leaks).toEqual([]);
  });

  it("no client component ('use client') imports @ventora/files", () => {
    const clients = files.filter((f) => {
      const source = text(f);
      return /^\s*['"]use client['"]/.test(source) && source.includes('@ventora/files');
    });
    expect(clients.map(rel)).toEqual([]);
  });
});
