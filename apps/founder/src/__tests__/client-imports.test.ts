import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Lot 5.10: a client component ('use client') never imports a value from a server package (their
 * index pulls pg, and the Founder build fails: „Can't resolve 'dns'”). Types are fine; a pure
 * helper has its own subpath (e.g. `@ventora/growth/overlaps`).
 */
const ROOT = join(__dirname, '..', '..');
const SERVER =
  /from\s+'@ventora\/(growth|commercial|billing|identity|support|workflows|access|audit|organizations|notifications|files|ai|db-kit)'/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe('Founder client components (5.10)', () => {
  it('import only types from the server packages', () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))]) {
      const src = readFileSync(file, 'utf8');
      if (!/^\s*['"]use client['"]/.test(src)) continue;
      for (const stmt of src.match(/^import[\s\S]*?from\s+'[^']+';/gm) ?? []) {
        if (SERVER.test(stmt) && !/^import\s+type\b/.test(stmt)) {
          offenders.push(`${relative(ROOT, file).split(sep).join('/')}: ${stmt.split('\n')[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
