#!/usr/bin/env node
/**
 * brand-check — MARCA-1 (decizia fondatoarei, 01.11.2026; glosarul, „Marca”): numele vizibil e
 * „Ventora Systems”, niciodată „Ventora” singur. Caută „Ventora” neurmat de „ Systems” (sau, în
 * germană, „-Systems-”, ca în „Ventora-Systems-Team”) acolo unde textul ajunge la oameni:
 *   - mesajele traduse (packages/i18n/messages, toate fișierele);
 *   - șabloanele de e-mail și expeditorul implicit (core/notifications);
 *   - titlurile aplicațiilor (apps/<app>/app/layout.tsx).
 * Pică (exit 1) la prima potrivire, cu fișierul și linia.
 *
 * Excepțiile permise sunt doar identificatorii interni (punctul 4 din MARCA-1): `window.Ventora`,
 * spațiul de nume `Ventora.`, `VentoraProvider`; pachetele `@ventora/*`, fișierele `ventora-*.svg`
 * și variabilele sunt cu literă mică și nu se potrivesc oricum.
 *
 * Folosit de `pnpm brand:check` (și în CI, jobul „Lint · Typecheck · Format”).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

const TARGETS = [
  'packages/i18n/messages',
  'core/notifications/src/templates',
  'core/notifications/src/email.ts',
  'apps/platform/app/layout.tsx',
  'apps/founder/app/layout.tsx',
  'apps/portal/app/layout.tsx',
];

const BARE = /Ventora(?![ -]Systems)/g;
const INTERNAL = /window\.Ventora\b|\bVentora\.|VentoraProvider/g;

function files(path) {
  const full = join(ROOT, path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

const hits = [];
for (const file of TARGETS.flatMap(files)) {
  if (!/\.(json|ts|tsx)$/.test(file)) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (line.replace(INTERNAL, '').match(BARE)) {
        hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      }
    });
}

if (hits.length) {
  console.error(
    `brand-check: „Ventora” fără „Systems” (glosarul, „Marca”) — ${hits.length} locuri:\n` +
      hits.map((h) => `  ${h}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  'brand-check — numele vizibil e „Ventora Systems” peste tot în mesaje, e-mailuri și titluri.',
);
