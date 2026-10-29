/**
 * visual-check.mjs — verificare vizuală design ↔ implementare (regula 12 din CLAUDE.md)
 *
 * Pentru fiecare componentă din scripts/visual-check.config.json → `enforced`:
 *   - captură de element din /design/preview/<Name>      (cadrul .c3f[data-theme])
 *   - captură de element din /design/demo/gallery/<Name> (cadrul [data-gallery-frame][data-theme])
 *   - diff pixelmatch, la fiecare viewport × temă
 *
 * Eșuează (exit 1) dacă:
 *   - un cadru lipsește (fără fallback la full-page),
 *   - cele două capturi au dimensiuni diferite,
 *   - diferența trece de `maxDiffPercent` și componenta nu are excepție aprobată.
 *
 * Necesită serverul de dev pornit (pnpm --filter @ventora/platform dev).
 * Rulare: node scripts/visual-check.mjs [--base http://localhost:3100] [--only Toast,Notice]
 * Ieșire: visual-check/ (PNG-uri + report.json + report.md)
 */

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'visual-check');

// Playwright vine din dependențele aplicației platform (aceeași versiune ca smoke-testele).
const requireFromPlatform = createRequire(path.join(ROOT, 'apps/platform/package.json'));
const { chromium } = requireFromPlatform('@playwright/test');

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const BASE = argValue('--base') ?? 'http://localhost:3100';
const ONLY = argValue('--only')
  ?.split(',')
  .map((s) => s.trim());

const config = JSON.parse(
  await readFile(path.join(ROOT, 'scripts/visual-check.config.json'), 'utf8'),
);
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

/* Listele plutitoare (portal, position: fixed) deschise din ALTE cadre ale paginii rămân în
   fereastră la derulare și ajung peste cadrul capturat. Le ascundem, la design și la galerie
   deopotrivă: o listă ([role=menu], [role=listbox], .v-popover, [data-popover]) din afara cadrului
   se ascunde dacă butonul care o controlează (aria-controls = id-ul ei sau al unui element din ea)
   nu e în cadru; o listă fără buton legat se ascunde dacă în cadru nu e niciun buton deschis
   (aria-expanded="true"). (Decizia fondatoarei, 28.10.2026.) */
function hideForeignPopovers(frame) {
  const floating = document.querySelectorAll(
    '[role="menu"], [role="listbox"], .v-popover, [data-popover]',
  );
  for (const el of floating) {
    if (frame.contains(el)) continue;
    const box = el.closest('.v-popover, [data-popover]') ?? el;
    const ids = [box, ...box.querySelectorAll('[id]')].map((n) => n.id).filter(Boolean);
    const triggers = ids.flatMap((id) => [
      ...document.querySelectorAll(`[aria-controls="${CSS.escape(id)}"]`),
    ]);
    // Fără buton legat prin aria-controls (ex. .v-popover din bundle la OrgSwitcher/DatePicker):
    // lista e străină dacă în cadru nu e niciun buton deschis.
    const foreign = triggers.length
      ? !triggers.some((t) => frame.contains(t))
      : !frame.querySelector('[aria-expanded="true"]');
    if (foreign) box.style.visibility = 'hidden';
  }
}

async function captureFrame(page, url, selector, outPath) {
  const res = await page.goto(BASE + url, { waitUntil: 'networkidle' });
  if (!res || !res.ok()) throw new Error(`${url} → HTTP ${res?.status() ?? 'fără răspuns'}`);
  await page.evaluate(() => document.fonts.ready);
  /* Listele deschise din start (ex. AccountMenu) își calculează poziția la deschidere și o
     actualizează doar la scroll / resize, în bundle ca și la noi. Pe runnerul Linux, DM Sans poate
     sosi după deschidere: fallback-ul mai lat schimbă rândurile din jur, apoi ancora se mută și lista
     rămâne pe vechea poziție (CI 3a9db7a: AccountMenu 1280 light, designul cu 16px mai jos). După
     încărcarea fonturilor trimitem un resize, ca ambele pagini să-și repoziționeze listele. */
  await page.evaluate(
    () =>
      new Promise((done) => {
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => requestAnimationFrame(done));
      }),
  );
  const frame = page.locator(selector).first();
  if ((await frame.count()) === 0) throw new Error(`${url}: cadrul ${selector} lipsește`);
  await frame.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await frame.evaluate(hideForeignPopovers);
  await frame.screenshot({ path: outPath, animations: 'disabled' });
  return PNG.sync.read(await readFile(outPath));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  // CHROMIUM_PATH: opțional, pentru mașini unde browserul Playwright e instalat în altă parte.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();

  const names = config.enforced.filter((n) => !ONLY || ONLY.includes(n));
  const results = [];

  for (const name of names) {
    for (const vp of config.viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const theme of config.themes) {
        const base = `${name}_${vp.width}_${theme}`;
        const r = { name, viewport: vp.width, theme, pct: null, ok: false, error: null };
        try {
          const design = await captureFrame(
            page,
            fill(config.designUrl, { name }),
            fill(config.designSelector, { theme }),
            path.join(OUT, `${base}_design.png`),
          );
          const impl = await captureFrame(
            page,
            fill(config.implUrl, { name }),
            fill(config.implSelector, { theme }),
            path.join(OUT, `${base}_impl.png`),
          );
          if (design.width !== impl.width || design.height !== impl.height) {
            throw new Error(
              `dimensiuni diferite: design ${design.width}×${design.height}, impl ${impl.width}×${impl.height}`,
            );
          }
          const diff = new PNG({ width: design.width, height: design.height });
          const n = pixelmatch(design.data, impl.data, diff.data, design.width, design.height, {
            threshold: config.pixelThreshold,
          });
          await writeFile(path.join(OUT, `${base}_diff.png`), PNG.sync.write(diff));
          r.pct = Number(((n / (design.width * design.height)) * 100).toFixed(2));
          const exception = config.exceptions?.[base];
          r.ok = r.pct <= config.maxDiffPercent || Boolean(exception);
          if (exception) r.exception = exception;
        } catch (err) {
          r.error = err.message;
        }
        results.push(r);
        const mark = r.ok ? '✓' : '✗';
        console.log(`${mark} ${base}: ${r.pct !== null ? r.pct + '%' : r.error}`);
      }
    }
  }
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ config, results }, null, 2));

  const cols = config.viewports.flatMap((v) => config.themes.map((t) => [v.width, t]));
  const cell = (r) =>
    !r
      ? '—'
      : r.error
        ? `✗ ${r.error}`
        : `${r.ok ? '✓' : '✗'} ${r.pct}%${r.exception ? ' (excepție)' : ''}`;
  const md = [
    `# Verificare vizuală — prag ${config.maxDiffPercent}%`,
    '',
    `| Componentă | ${cols.map(([w, t]) => `${w} ${t}`).join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    ...names.map(
      (n) =>
        `| ${n} | ${cols
          .map(([w, t]) =>
            cell(results.find((r) => r.name === n && r.viewport === w && r.theme === t)),
          )
          .join(' | ')} |`,
    ),
    '',
    `**${results.length - failed.length}/${results.length}** în prag.`,
  ].join('\n');
  await writeFile(path.join(OUT, 'report.md'), md + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, md + '\n', { flag: 'a' });
  }

  if (failed.length > 0) {
    console.error(
      `\n${failed.length}/${results.length} peste prag sau cu erori — vezi visual-check/report.md`,
    );
    process.exit(1);
  }
  console.log(`\nToate ${results.length} în prag.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
