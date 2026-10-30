import type { IconName } from '@ventora/ui';

/* „Dispozitive conectate” (S110): sistemul și browserul din user-agent („Windows · Chrome”), urmate
   de oră. Fără oraș: nu păstrăm localizarea după IP. */

const OS: [RegExp, string, IconName][] = [
  [/iPhone|iPad|iPod/, 'iOS', 'smartphone'],
  [/Android/, 'Android', 'smartphone'],
  [/Macintosh|Mac OS X/, 'macOS', 'laptop'],
  [/Windows/, 'Windows', 'monitor'],
  [/CrOS/, 'ChromeOS', 'laptop'],
  [/Linux/, 'Linux', 'monitor'],
];

// Ordinea contează: Edge și Opera se declară și Chrome; Chrome se declară și Safari.
const BROWSER: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

export function describeDevice(userAgent: string | null): { name: string; icon: IconName } {
  const ua = userAgent ?? '';
  const os = OS.find(([re]) => re.test(ua));
  const browser = BROWSER.find(([re]) => re.test(ua));
  const parts = [os?.[1], browser?.[1]].filter(Boolean);
  return { name: parts.length ? parts.join(' · ') : '—', icon: os?.[2] ?? 'monitor' };
}
