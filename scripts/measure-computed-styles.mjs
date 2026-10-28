/**
 * measure-computed-styles.mjs
 * Măsoară getComputedStyle pentru elementele cheie din design vs galerie.
 * Folosit pentru a explica diff-urile pixelmatch > 2%.
 *
 * Rulare: node scripts/measure-computed-styles.mjs
 * Necesită: server dev pornit pe :3100
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const playwrightPkg = path.resolve(
  __dirname,
  '../node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.js',
);
const { chromium } = _require(playwrightPkg);
const BASE = 'http://localhost:3100';

const PROPS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'height',
  'gap',
  'minHeight',
];

async function measureSelector(page, url, selector, theme = 'light') {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);

  const el = page.locator(selector).first();
  const count = await el.count();
  if (count === 0) return null;

  return page.evaluate(
    ({ sel, props }) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const result = {};
      for (const p of props) result[p] = cs[p];
      return result;
    },
    { sel: selector, props: PROPS },
  );
}

async function compareComponent(page, name, selectors) {
  console.log(`\n═══ ${name} ═══`);

  const designUrl = `${BASE}/design/preview/${name}`;
  const galleryUrl = `${BASE}/design/demo/gallery/${name}`;

  for (const [label, selector] of Object.entries(selectors)) {
    for (const theme of ['light', 'dark']) {
      const [design, gallery] = await Promise.all([
        measureSelector(page, designUrl, selector, theme),
        measureSelector(page, galleryUrl, selector, theme),
      ]);

      if (!design && !gallery) {
        console.log(`  [${theme}] ${label} (${selector}): selector negăsit în ambele`);
        continue;
      }

      console.log(`\n  [${theme}] ${label} — ${selector}`);
      console.log(
        `  ${'Proprietate'.padEnd(18)} ${'Design'.padEnd(22)} ${'Galerie'.padEnd(22)} Diff`,
      );
      console.log(`  ${'─'.repeat(72)}`);

      for (const prop of PROPS) {
        const dv = design?.[prop] ?? '(lipsă)';
        const gv = gallery?.[prop] ?? '(lipsă)';
        const diff = dv !== gv ? '⚠ DIFERIT' : '';
        if (diff || dv !== '0px') {
          console.log(`  ${prop.padEnd(18)} ${dv.padEnd(22)} ${gv.padEnd(22)} ${diff}`);
        }
      }
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Disable animations
  await page.addInitScript(() => {
    const s = document.createElement('style');
    s.textContent =
      '*, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }';
    document.head?.appendChild(s);
  });

  await compareComponent(page, 'Button', {
    'Buton sm (label)': '.v-btn--sm .v-btn__label, [class*="btn"][class*="sm"] span',
    'Buton md (label)': '.v-btn--md .v-btn__label, [class*="btn"][class*="md"] span',
    'Buton sm (root)': '.v-btn--sm, [class*="Button_sm"]',
  });

  await compareComponent(page, 'Notice', {
    'Notice root': '.v-notice, [class*="Notice_root"]',
    'Notice title': '.v-notice__title, [class*="Notice_title"]',
    'Notice body/desc': '.v-notice__body, [class*="Notice_desc"]',
    'Notice icon': '.v-notice__icon, [class*="Notice_icon"]',
  });

  await compareComponent(page, 'AttentionList', {
    'AttentionList item': '.v-attention-item, [class*="AttentionList_item"]',
    'AttentionList actions': '.v-attention-item__actions, [class*="AttentionList_actions"]',
    'Buton sm în AttentionList':
      '.v-attention-item .v-btn--sm, [class*="AttentionList"] [class*="Button_sm"]',
  });

  await compareComponent(page, 'Toast', {
    'Toast root': '.v-toast, [class*="Toast_root"]',
    'Toast body': '.v-toast__body, [class*="Toast_body"]',
    'Toast action (390)': '.v-toast__action, [class*="Toast_action"]',
  });

  await compareComponent(page, 'UsageMeter', {
    'UsageMeter root': '.v-usage-meter, [class*="UsageMeter_root"]',
    'Buton sm în UsageMeter':
      '.v-usage-meter .v-btn--sm, [class*="UsageMeter"] [class*="Button_sm"]',
  });

  await browser.close();
  console.log('\nGata.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
