/**
 * screenshot-hub-v3.mjs
 * Capturi Hub: HubSignIn / HubInvite / HubLauncher + Galerii Lot 4-6
 *
 * Rulare: node scripts/screenshot-hub-v3.mjs
 * Necesită: server dev pornit pe :3100 (pnpm --filter @ventora/platform dev)
 *
 * Output: screenshots/ (fișierele existente se suprascriu)
 *
 * Hub (perechi):
 *   <screen>_1280_<theme>_impl.png   — implementare React (@ventora/ui)
 *   <screen>_390_<theme>_impl.png
 *   <screen>_1280_<theme>_design.png — design aprobat (Claude Design Bundle)
 *   <screen>_390_<theme>_design.png
 *
 * Galerii Lot 4-6 + Agenda:
 *   gallery_<name>_<viewport>_<theme>_impl.png
 */

import { createRequire } from 'module';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const BASE = 'http://localhost:3100';

// playwright e în pnpm store — îl încărcăm explicit din store
const _require = createRequire(import.meta.url);
const playwrightPkg = path.resolve(
  __dirname,
  '../node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.js',
);
const { chromium } = _require(playwrightPkg);

/* ── Configurare capturi ─────────────────────────────────────────────── */

const SCREENS = ['signin', 'invite', 'launcher'];

// Galerii Lot 4-6 + Agenda
const GALLERY_NAMES = [
  // Lot 4
  'Toast',
  'StatusPill',
  'StatusDot',
  'Badge',
  'Avatar',
  'Notice',
  'AttentionList',
  'EmptyState',
  'Skeleton',
  'ProgressBar',
  'UsageMeter',
  'Kbd',
  // Lot 5
  'DatePicker',
  'SlotPicker',
  'DataTable',
  'Agenda',
  'Schedule',
  'Kanban',
  'Timeline',
  // Lot 6
  'Stat',
  'LineChart',
  'BarChart',
];

// Componente cu min-width intrinsec (nu e bug de overflow)
const OVERFLOW_EXEMPT = new Set(['DataTable', 'Schedule', 'Kanban', 'Timeline']);

const GALLERY_VARIANTS = [];
for (const name of GALLERY_NAMES) {
  for (const viewport of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      GALLERY_VARIANTS.push({ name, viewport, theme, allowOverflow: OVERFLOW_EXEMPT.has(name) });
    }
  }
}

// _impl: rute izolate din /design/demo/screen/*
const IMPL_VARIANTS = [
  { name: 'signin', viewport: 1280, theme: 'light', state: 'default' },
  { name: 'signin', viewport: 1280, theme: 'dark', state: 'default' },
  { name: 'signin', viewport: 390, theme: 'light', state: 'default' },
  { name: 'signin', viewport: 390, theme: 'dark', state: 'default' },
  { name: 'signin', viewport: 1280, theme: 'light', state: 'error' },
  { name: 'invite', viewport: 1280, theme: 'light', state: 'default' },
  { name: 'invite', viewport: 1280, theme: 'dark', state: 'default' },
  { name: 'invite', viewport: 390, theme: 'light', state: 'default' },
  { name: 'invite', viewport: 390, theme: 'dark', state: 'default' },
  { name: 'invite', viewport: 1280, theme: 'light', state: 'expired' },
  { name: 'launcher', viewport: 1280, theme: 'light', state: 'default' },
  { name: 'launcher', viewport: 1280, theme: 'dark', state: 'default' },
  { name: 'launcher', viewport: 390, theme: 'light', state: 'default' },
  { name: 'launcher', viewport: 390, theme: 'dark', state: 'default' },
];

// _design: din /design/preview/<ComponentName>
// Componente din docs/design/system/components/
const COMPONENT_MAP = {
  signin: 'HubSignIn',
  invite: 'HubInvite',
  launcher: 'HubLauncher',
};

const DESIGN_VARIANTS = [];
for (const screen of SCREENS) {
  for (const theme of ['light', 'dark']) {
    DESIGN_VARIANTS.push({ name: screen, viewport: 1280, theme });
    DESIGN_VARIANTS.push({ name: screen, viewport: 390, theme });
  }
}

/* ── Helper: ascunde overlay-ul Next.js dev ──────────────────────────── */
async function hideDevOverlay(page) {
  await page.addStyleTag({
    content: `
      body > nextjs-portal,
      #__next-build-watcher,
      [data-nextjs-dialog],
      [data-nextjs-toast],
      [data-nextjs-errors],
      [data-nextjs-dev-overlay] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
      }
    `,
  });
}

/* ── Captură _impl ────────────────────────────────────────────────────── */
async function captureImpl(page, variant) {
  const { name, viewport, theme, state } = variant;
  const height = viewport === 390 ? 844 : 900;
  await page.setViewportSize({ width: viewport, height });

  const params = new URLSearchParams({ theme });
  if (state && state !== 'default') params.set('state', state);

  const url = `${BASE}/design/demo/screen/${name}?${params}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await hideDevOverlay(page);
  // Setăm tema explicit pe <html> (tokenii :root[data-theme] necesită atribut pe element rădăcină)
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);

  const stateSuffix = state && state !== 'default' ? `_${state}` : '';
  const filename = `${name}_${viewport}_${theme}${stateSuffix}_impl.png`;
  const outPath = path.join(OUT, filename);

  // Verifică overflow orizontal
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollW > viewport) {
    throw new Error(`overflow orizontal: scrollWidth=${scrollW} > viewport=${viewport}`);
  }

  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`  ✓ ${filename}`);
}

/* ── Captură _design ─────────────────────────────────────────────────── */
async function captureDesign(page, variant) {
  const { name, viewport, theme } = variant;

  // Viewport mai mare pentru a încăpea frame-ul complet + context
  await page.setViewportSize({ width: 2000, height: 2400 });

  const component = COMPONENT_MAP[name];
  const url = `${BASE}/design/preview/${component}`;
  await page.goto(url, { waitUntil: 'networkidle' });

  // Așteptăm React bundle să randeze complet
  const frameClass = viewport === 390 ? '.scr-m' : '.scr-d';
  const selector = `${frameClass}[data-theme="${theme}"]`;

  try {
    await page.waitForSelector(selector, { timeout: 15_000 });
  } catch {
    console.warn(`  ⚠ Selector "${selector}" not found in ${component}`);
    return;
  }

  // Setăm tema pe <html> astfel încât tokenii CSS :root[data-theme] să se activeze corect
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(150);

  // Scroll la element pentru a-l face vizibil înainte de screenshot
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const filename = `${name}_${viewport}_${theme}_design.png`;
  const outPath = path.join(OUT, filename);

  await el.screenshot({ path: outPath });
  console.log(`  ✓ ${filename}`);
}

/* ── Captură galerie ─────────────────────────────────────────────────── */
async function captureGallery(page, variant) {
  const { name, viewport, theme, allowOverflow } = variant;
  const height = viewport === 390 ? 844 : 900;
  await page.setViewportSize({ width: viewport, height });

  const url = `${BASE}/design/demo/gallery/${name}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await hideDevOverlay(page);
  await page.waitForTimeout(300);

  const filename = `gallery_${name}_${viewport}_${theme}_impl.png`;
  const outPath = path.join(OUT, filename);

  // Caută frame-ul marcat cu data-gallery-frame și data-theme
  const selector = `[data-gallery-frame][data-theme="${theme}"]`;
  const el = page.locator(selector).first();
  const count = await el.count();

  if (count > 0) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await el.screenshot({ path: outPath });
  } else {
    // Fallback: full-page cu tema aplicată global
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    if (!allowOverflow) {
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scrollW > viewport) {
        throw new Error(`overflow orizontal: scrollWidth=${scrollW} > viewport=${viewport}`);
      }
    }
    await page.screenshot({ path: outPath, fullPage: true });
  }

  const suffix = allowOverflow ? ' (overflow așteptat)' : '';
  console.log(`  ✓ ${filename}${suffix}`);
}

/* ── Captură galerie _design (/design/preview/<Name>) ────────────────── */
async function captureGalleryDesign(page, variant) {
  const { name, viewport, theme } = variant;
  const height = viewport === 390 ? 844 : 900;
  await page.setViewportSize({ width: viewport, height });

  const url = `${BASE}/design/preview/${name}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await hideDevOverlay(page);
  await page.waitForTimeout(400);

  const filename = `gallery_${name}_${viewport}_${theme}_design.png`;
  const outPath = path.join(OUT, filename);

  // Caută primul frame cu data-theme — designul folosește class diferite (c3f, qf, al-frame etc.)
  // dar toate au data-theme ca atribut DOM
  const selector = `[data-theme="${theme}"]`;
  const el = page.locator(selector).first();
  const count = await el.count();

  if (count > 0) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await el.screenshot({ path: outPath });
  } else {
    // Fallback: full-page cu tema globală (nu ar trebui să ajungă aici dacă preview.html are frames)
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(200);
    await page.screenshot({ path: outPath, fullPage: true });
    console.warn(`  ⚠ "${selector}" negăsit în preview/${name} — full-page fallback`);
  }

  console.log(`  ✓ ${filename}`);
}

/* ── Diff pixelmatch ─────────────────────────────────────────────────── */
async function computeDiff(name, viewport, theme) {
  const implPath = path.join(OUT, `gallery_${name}_${viewport}_${theme}_impl.png`);
  const designPath = path.join(OUT, `gallery_${name}_${viewport}_${theme}_design.png`);
  const diffPath = path.join(OUT, `gallery_${name}_${viewport}_${theme}_diff.png`);

  if (!existsSync(implPath) || !existsSync(designPath)) {
    return { name, viewport, theme, pct: null, note: 'lipsă captură' };
  }

  const [implBuf, designBuf] = await Promise.all([readFile(implPath), readFile(designPath)]);
  const impl = PNG.sync.read(implBuf);
  const design = PNG.sync.read(designBuf);

  // Crop la dimensiunile minime pentru comparație corectă
  const w = Math.min(impl.width, design.width);
  const h = Math.min(impl.height, design.height);

  // Extrage regiunile cropped
  function cropPNG(src, cw, ch) {
    const dst = new PNG({ width: cw, height: ch });
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * cw + x) * 4;
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = src.data[si + 3];
      }
    }
    return dst;
  }

  const implCrop = cropPNG(impl, w, h);
  const designCrop = cropPNG(design, w, h);
  const diffPNG = new PNG({ width: w, height: h });

  const numDiff = pixelmatch(implCrop.data, designCrop.data, diffPNG.data, w, h, {
    threshold: 0.1,
  });

  await writeFile(diffPath, PNG.sync.write(diffPNG));

  const pct = ((numDiff / (w * h)) * 100).toFixed(2);
  const sizeMismatch =
    impl.width !== design.width || impl.height !== design.height
      ? ` (impl ${impl.width}×${impl.height} vs design ${design.width}×${design.height})`
      : '';
  console.log(`  diff ${name} ${viewport} ${theme}: ${pct}%${sizeMismatch}`);
  return { name, viewport, theme, pct: parseFloat(pct), sizeMismatch: sizeMismatch || null };
}

/* ── Main ─────────────────────────────────────────────────────────────── */
async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Disable CSS animations/transitions pentru capturi stabile
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
        animation-delay: 0.001ms !important;
      }
    `;
    document.head?.appendChild(style);
  });

  console.log('\n── _impl (implementare @ventora/ui) ──');
  for (const variant of IMPL_VARIANTS) {
    try {
      await captureImpl(page, variant);
    } catch (err) {
      console.error(
        `  ✗ ${variant.name}_${variant.viewport}_${variant.theme}_impl: ${err.message}`,
      );
    }
  }

  console.log('\n── _design (Claude Design Bundle) ──');
  for (const variant of DESIGN_VARIANTS) {
    try {
      await captureDesign(page, variant);
    } catch (err) {
      console.error(
        `  ✗ ${variant.name}_${variant.viewport}_${variant.theme}_design: ${err.message}`,
      );
    }
  }

  console.log('\n── Galerii Lot 4-6 + Agenda (_impl) ──');
  for (const variant of GALLERY_VARIANTS) {
    try {
      await captureGallery(page, variant);
    } catch (err) {
      console.error(
        `  ✗ gallery_${variant.name}_${variant.viewport}_${variant.theme}_impl: ${err.message}`,
      );
    }
  }

  // Capturi _design pentru galerii (regula 12)
  const LOT4_NAMES = [
    'Toast',
    'StatusPill',
    'StatusDot',
    'Badge',
    'Avatar',
    'Notice',
    'AttentionList',
    'EmptyState',
    'Skeleton',
    'ProgressBar',
    'UsageMeter',
    'Kbd',
  ];
  const GALLERY_DESIGN_VARIANTS = [];
  for (const name of LOT4_NAMES) {
    for (const viewport of [1280, 390]) {
      for (const theme of ['light', 'dark']) {
        GALLERY_DESIGN_VARIANTS.push({ name, viewport, theme });
      }
    }
  }

  console.log('\n── Galerii Lot 4 (_design — /design/preview/<Name>) ──');
  for (const variant of GALLERY_DESIGN_VARIANTS) {
    try {
      await captureGalleryDesign(page, variant);
    } catch (err) {
      console.error(
        `  ✗ gallery_${variant.name}_${variant.viewport}_${variant.theme}_design: ${err.message}`,
      );
    }
  }

  await browser.close();

  // Calculează diff-urile pixelmatch
  console.log('\n── Diff pixelmatch Lot 4 ──');
  const diffResults = [];
  for (const variant of GALLERY_DESIGN_VARIANTS) {
    const result = await computeDiff(variant.name, variant.viewport, variant.theme);
    diffResults.push(result);
  }

  // Tabel sumar diff
  console.log('\n── Sumar diff ──');
  console.log('Component         | 1280 light | 1280 dark | 390 light | 390 dark');
  console.log('------------------|------------|-----------|-----------|----------');
  for (const name of LOT4_NAMES) {
    const get = (vp, th) => {
      const r = diffResults.find((d) => d.name === name && d.viewport === vp && d.theme === th);
      return r ? (r.pct !== null ? `${r.pct}%` : r.note) : '—';
    };
    const row = `${name.padEnd(17)} | ${get(1280, 'light').padStart(10)} | ${get(1280, 'dark').padStart(9)} | ${get(390, 'light').padStart(9)} | ${get(390, 'dark').padStart(8)}`;
    console.log(row);
  }

  const total =
    IMPL_VARIANTS.length +
    DESIGN_VARIANTS.length +
    GALLERY_VARIANTS.length +
    GALLERY_DESIGN_VARIANTS.length;
  console.log(`\nGata: ${total} capturi în screenshots/\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
