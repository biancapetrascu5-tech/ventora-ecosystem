/**
 * screenshot-hub-v2.mjs — capturi izolate pentru HubSignIn / HubInvite / HubLauncher
 *
 * _impl.png  = implementare reală @ventora/ui (rute /design/demo/screen/*)
 * _design.png = export Claude Design (element.screenshot() pe frame-uri din /design/preview/*)
 *
 * Rulare: node apps/platform/screenshot-hub-v2.mjs
 * Cerință: serverul dev pornit (pnpm dev --filter platform), port 3100
 */

import { chromium } from '@playwright/test';
import { createHash } from 'crypto';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..');
const OUT = join(ROOT, 'screenshots');

mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3100';
const VIEWPORTS = [
  { w: 1280, h: 800, label: '1280' },
  { w: 390, h: 844, label: '390' },
];
const THEMES = ['light', 'dark'];

/* ── Capturi _impl ──────────────────────────────────────────────────────── */

const IMPL_SHOTS = [
  // signin: default light/dark × 1280/390 + error light
  {
    url: '/design/demo/screen/signin?theme=light&state=default',
    name: 'signin_1280_light_impl',
    vp: '1280',
  },
  {
    url: '/design/demo/screen/signin?theme=dark&state=default',
    name: 'signin_1280_dark_impl',
    vp: '1280',
  },
  {
    url: '/design/demo/screen/signin?theme=light&state=default',
    name: 'signin_390_light_impl',
    vp: '390',
  },
  {
    url: '/design/demo/screen/signin?theme=dark&state=default',
    name: 'signin_390_dark_impl',
    vp: '390',
  },
  {
    url: '/design/demo/screen/signin?theme=light&state=error',
    name: 'signin_1280_light_error_impl',
    vp: '1280',
  },
  // invite: default + expired, light/dark × 1280/390
  {
    url: '/design/demo/screen/invite?theme=light&state=default',
    name: 'invite_1280_light_impl',
    vp: '1280',
  },
  {
    url: '/design/demo/screen/invite?theme=dark&state=default',
    name: 'invite_1280_dark_impl',
    vp: '1280',
  },
  {
    url: '/design/demo/screen/invite?theme=light&state=default',
    name: 'invite_390_light_impl',
    vp: '390',
  },
  {
    url: '/design/demo/screen/invite?theme=dark&state=default',
    name: 'invite_390_dark_impl',
    vp: '390',
  },
  {
    url: '/design/demo/screen/invite?theme=light&state=expired',
    name: 'invite_1280_light_expired_impl',
    vp: '1280',
  },
  // launcher: light/dark × 1280/390
  { url: '/design/demo/screen/launcher?theme=light', name: 'launcher_1280_light_impl', vp: '1280' },
  { url: '/design/demo/screen/launcher?theme=dark', name: 'launcher_1280_dark_impl', vp: '1280' },
  { url: '/design/demo/screen/launcher?theme=light', name: 'launcher_390_light_impl', vp: '390' },
  { url: '/design/demo/screen/launcher?theme=dark', name: 'launcher_390_dark_impl', vp: '390' },
];

/* ── Capturi _design (element.screenshot pe frame-uri din /design/preview/*) ── */

const DESIGN_SHOTS = [
  {
    previewUrl: '/design/preview/HubSignIn',
    selector: '.scr-d[data-theme="light"]',
    name: 'signin_1280_light_design',
  },
  {
    previewUrl: '/design/preview/HubSignIn',
    selector: '.scr-d[data-theme="dark"]',
    name: 'signin_1280_dark_design',
  },
  {
    previewUrl: '/design/preview/HubSignIn',
    selector: '.scr-m[data-theme="light"]',
    name: 'signin_390_light_design',
  },
  {
    previewUrl: '/design/preview/HubSignIn',
    selector: '.scr-m[data-theme="dark"]',
    name: 'signin_390_dark_design',
  },
  {
    previewUrl: '/design/preview/HubInvite',
    selector: '.scr-d[data-theme="light"]',
    name: 'invite_1280_light_design',
  },
  {
    previewUrl: '/design/preview/HubInvite',
    selector: '.scr-d[data-theme="dark"]',
    name: 'invite_1280_dark_design',
  },
  {
    previewUrl: '/design/preview/HubInvite',
    selector: '.scr-m[data-theme="light"]',
    name: 'invite_390_light_design',
  },
  {
    previewUrl: '/design/preview/HubInvite',
    selector: '.scr-m[data-theme="dark"]',
    name: 'invite_390_dark_design',
  },
  {
    previewUrl: '/design/preview/HubLauncher',
    selector: '.scr-d[data-theme="light"]',
    name: 'launcher_1280_light_design',
  },
  {
    previewUrl: '/design/preview/HubLauncher',
    selector: '.scr-d[data-theme="dark"]',
    name: 'launcher_1280_dark_design',
  },
  {
    previewUrl: '/design/preview/HubLauncher',
    selector: '.scr-m[data-theme="light"]',
    name: 'launcher_390_light_design',
  },
  {
    previewUrl: '/design/preview/HubLauncher',
    selector: '.scr-m[data-theme="dark"]',
    name: 'launcher_390_dark_design',
  },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function vpForLabel(label) {
  return VIEWPORTS.find((v) => v.label === label) ?? VIEWPORTS[0];
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function luminosity(buf) {
  // Medie pe canalul R (index 0 din RGBA) — aproximare rapidă
  const arr = new Uint8Array(buf);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i += 4) {
    sum += (arr[i] * 299 + arr[i + 1] * 587 + arr[i + 2] * 114) / 1000;
    n++;
  }
  return n > 0 ? sum / n : 128;
}

/* ── Main ────────────────────────────────────────────────────────────────── */

const browser = await chromium.launch({ headless: true });
const errors = [];
const hashes = new Map(); // name → hash, pentru verificarea unicității

console.log('\n── Capturi _impl (' + IMPL_SHOTS.length + ') ──────────────────────────────');

for (const shot of IMPL_SHOTS) {
  const vp = vpForLabel(shot.vp);
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();

  const theme = shot.url.includes('theme=dark') ? 'dark' : 'light';
  await page.emulateMedia({ colorScheme: theme === 'dark' ? 'dark' : 'light' });

  await page.goto(BASE + shot.url, { waitUntil: 'load', timeout: 30000 });

  // Setăm explicit data-theme pe documentElement (în plus față de URL param)
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
  }, theme);

  // Scurtă așteptare pentru tranziții CSS
  await page.waitForTimeout(300);

  // Verificăm că lățimea reală a body-ului e cel puțin ~vp.w (nu comprimată)
  const bodyW = await page.evaluate(() => document.body.scrollWidth);
  if (bodyW < vp.w - 10) {
    errors.push(`EȘEC LĂȚIME: ${shot.name} — body.scrollWidth=${bodyW}, viewport=${vp.w}`);
  }

  const outPath = join(OUT, shot.name + '.png');
  const buf = await page.screenshot({ path: outPath, fullPage: false });

  // Verificare dark: luminozitate trebuie să fie < 128 (fond întunecat)
  if (theme === 'dark') {
    const lum = luminosity(buf);
    if (lum > 128) {
      errors.push(
        `AVERTISMENT DARK: ${shot.name} — luminozitate=${lum.toFixed(1)} (prea deschis, dark mode posibil nefuncțional)`,
      );
    }
  }

  const hash = createHash('sha256').update(buf).digest('hex');
  hashes.set(shot.name, hash);
  console.log(`  ✓ ${shot.name}.png`);

  await ctx.close();
}

console.log('\n── Capturi _design (' + DESIGN_SHOTS.length + ') ──────────────────────────');

for (const shot of DESIGN_SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + shot.previewUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(500);

  // Găsim frame-ul prin selectoruul exact (data-theme + clasă dimensiune)
  const el = await page.$(shot.selector);
  const outPath = join(OUT, shot.name + '.png');
  if (el) {
    await el.scrollIntoViewIfNeeded();
    const buf = await el.screenshot({ path: outPath });
    const hash = createHash('sha256').update(buf).digest('hex');
    hashes.set(shot.name, hash);
    console.log(`  ✓ ${shot.name}.png`);
  } else {
    // Fallback: screenshot full page dacă selectorul nu găsește nimic
    const buf = await page.screenshot({ path: outPath, fullPage: true });
    const hash = createHash('sha256').update(buf).digest('hex');
    hashes.set(shot.name, hash);
    console.log(`  ✓ ${shot.name}.png (fallback — selector '${shot.selector}' negăsit)`);
  }

  await ctx.close();
}

await browser.close();

/* ── Verificări finale ────────────────────────────────────────────────────── */

console.log('\n── Verificări ──────────────────────────────────────────────────────────');

// 1. Hash-uri unice între light/dark pentru aceeași rezoluție și ecran
const pairs = [
  ['signin_1280_light_impl', 'signin_1280_dark_impl'],
  ['signin_390_light_impl', 'signin_390_dark_impl'],
  ['invite_1280_light_impl', 'invite_1280_dark_impl'],
  ['invite_390_light_impl', 'invite_390_dark_impl'],
  ['launcher_1280_light_impl', 'launcher_1280_dark_impl'],
  ['launcher_390_light_impl', 'launcher_390_dark_impl'],
  ['signin_1280_light_design', 'signin_1280_dark_design'],
  ['signin_390_light_design', 'signin_390_dark_design'],
  ['invite_1280_light_design', 'invite_1280_dark_design'],
  ['invite_390_light_design', 'invite_390_dark_design'],
  ['launcher_1280_light_design', 'launcher_1280_dark_design'],
  ['launcher_390_light_design', 'launcher_390_dark_design'],
];

for (const [a, b] of pairs) {
  const ha = hashes.get(a);
  const hb = hashes.get(b);
  if (ha && hb && ha === hb) {
    errors.push(`EȘEC HASH: ${a} și ${b} sunt identice — dark mode nefuncțional`);
  } else if (ha && hb) {
    console.log(`  ✓ hash unic: ${a} vs ${b}`);
  }
}

// 2. Raport final
console.log('\n── Rezultat ────────────────────────────────────────────────────────────');
if (errors.length === 0) {
  console.log('✓ Toate capturile OK. Fișiere în screenshots/');
} else {
  console.log('✗ Erori găsite:');
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
