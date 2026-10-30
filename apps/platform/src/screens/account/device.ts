import type { IconName } from '@ventora/ui';

/* „Dispozitive conectate”: sistemul și browserul din user-agent („Windows · Chrome”), ca în
   design („MacBook · Chrome · Sibiu”). Orașul nu se știe (nu păstrăm localizarea IP-ului). */

const OS: [RegExp, string, IconName][] = [
  [/iPhone/, 'iPhone', 'smartphone'],
  [/iPad/, 'iPad', 'smartphone'],
  [/Android/, 'Android', 'smartphone'],
  [/Macintosh|Mac OS X/, 'Mac', 'laptop'],
  [/Windows/, 'Windows', 'laptop'],
  [/CrOS/, 'ChromeOS', 'laptop'],
  [/Linux/, 'Linux', 'laptop'],
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
  return { name: parts.length ? parts.join(' · ') : '—', icon: os?.[2] ?? 'laptop' };
}
