/**
 * i18n:check — verifică că toate limbile au exact aceleași chei ca RO.
 * Prinde: chei lipsă și chei în plus față de RO.
 * @see packages/i18n/src/index.ts (CANONICAL_LOCALE, SUPPORTED_LOCALES)
 */
import { readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dirArg = process.argv.find((a) => a.startsWith('--dir='));
const messagesDir = dirArg
  ? resolve(process.cwd(), dirArg.slice(6))
  : join(__dirname, '..', 'messages');

const SUPPORTED_LOCALES = ['ro', 'en', 'fr', 'es', 'de', 'it'];
const CANONICAL = 'ro';

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? flattenKeys(v, fullKey)
      : [fullKey];
  });
}

let hasErrors = false;

const canonicalMsg = JSON.parse(readFileSync(join(messagesDir, `${CANONICAL}.json`), 'utf-8'));
const canonicalKeys = new Set(flattenKeys(canonicalMsg));

for (const lang of SUPPORTED_LOCALES) {
  if (lang === CANONICAL) continue;

  let msg;
  try {
    msg = JSON.parse(readFileSync(join(messagesDir, `${lang}.json`), 'utf-8'));
  } catch {
    console.error(`[${lang}] Fisierul messages/${lang}.json lipseste.`);
    hasErrors = true;
    continue;
  }

  const langKeys = new Set(flattenKeys(msg));

  for (const key of canonicalKeys) {
    if (!langKeys.has(key)) {
      console.error(`[${lang}] Cheie lipsa: "${key}"`);
      hasErrors = true;
    }
  }

  for (const key of langKeys) {
    if (!canonicalKeys.has(key)) {
      console.error(`[${lang}] Cheie in plus fata de RO: "${key}"`);
      hasErrors = true;
    }
  }
}

if (hasErrors) {
  console.error('\ni18n:check — esuat. Catalogele de mesaje nu sunt sincronizate.');
  process.exit(1);
} else {
  console.log('i18n:check — toate cele 6 limbi sunt complete si sincronizate cu RO.');
  process.exit(0);
}
