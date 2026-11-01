// The single operational email template for the whole ecosystem (design system S3 / S54,
// BookingSmsNotifications, export v56): inbox preheader, Ventora logo, eyebrow, title, the
// text, one primary button, what happens next, then a footer with why you get it and the
// company. One column, 600px, light only; on phones the button takes the full width.
// Every transactional email renders through renderOperationalEmail — no per-email HTML.
// Colours: light-theme tokens from docs/design/system/tokens.json (no dark mode, S3).
import { emailLogoUrl } from '../links';

const COLOR = {
  canvas: '#F2F3F0',
  raised: '#FFFFFF',
  line: '#E4E5E2',
  ink: '#000C3F',
  inkSecondary: '#3D4566',
  primary: '#000C3F',
  onPrimary: '#FFFFFF',
} as const;
const FONT = "'DM Sans',Arial,Helvetica,sans-serif";

export interface OperationalEmail {
  lang: string;
  subject: string;
  /** Inbox preview line, hidden in the body. */
  preheader: string;
  /** Small uppercase line above the title: business, app or product. */
  eyebrow: string;
  title: string;
  /** Main text, in order (greeting, what happened). */
  lead: string[];
  button?: { label: string; href: string };
  /** What happens next — smaller, secondary. `strong` for a warning that must stand out. */
  after: Array<string | { text: string; strong: true }>;
  /** Empty: no signature (the S115 billing e-mails have none). */
  signature: string;
  /** Why the reader gets this email. */
  why: string;
  company: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const P_BODY = `margin:0 0 12px;font-size:16px;line-height:24px;color:${COLOR.ink}`;
const P_SMALL = `margin:0 0 8px;font-size:14px;line-height:20px;color:${COLOR.inkSecondary}`;
const P_CAPTION = `margin:0 0 4px;font-size:12px;line-height:16px;color:${COLOR.inkSecondary}`;

function afterHtml(item: OperationalEmail['after'][number]): string {
  if (typeof item === 'string') return `<p style="${P_SMALL}">${escapeHtml(item)}</p>`;
  return `<p style="${P_SMALL}"><strong style="color:${COLOR.ink}">${escapeHtml(item.text)}</strong></p>`;
}

function logo(): string {
  const src = emailLogoUrl();
  if (!src) {
    return (
      `<span style="font-family:'Syne',${FONT};font-size:20px;line-height:24px;font-weight:700;` +
      `color:${COLOR.ink}">Ventora</span>`
    );
  }
  return (
    `<img src="${escapeHtml(src)}" width="160" height="44" alt="Ventora" ` +
    `style="display:block;width:160px;height:44px;border:0;outline:none;text-decoration:none">`
  );
}

export function renderOperationalEmail(e: OperationalEmail): RenderedEmail {
  const button = e.button
    ? `<p style="margin:8px 0 20px"><a class="v-btn" href="${escapeHtml(e.button.href)}" ` +
      `style="display:inline-block;background:${COLOR.primary};color:${COLOR.onPrimary};` +
      `text-decoration:none;font-weight:600;font-size:16px;line-height:24px;` +
      `padding:12px 20px;border-radius:8px">${escapeHtml(e.button.label)}</a></p>`
    : '';

  const html =
    `<!doctype html><html lang="${escapeHtml(e.lang)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(e.subject)}</title>` +
    `<style>@media (max-width:480px){.v-canvas{padding:16px 8px!important}` +
    `.v-pad{padding-left:16px!important;padding-right:16px!important}` +
    `.v-btn{display:block!important;text-align:center!important}}</style></head>` +
    `<body style="margin:0;padding:0;background:${COLOR.canvas};font-family:${FONT}">` +
    // preheader: shown by the inbox next to the subject, invisible in the message
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(e.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="background:${COLOR.canvas}"><tr><td align="center" class="v-canvas" style="padding:24px 16px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:600px"><tr><td style="background:${COLOR.raised};` +
    `border:1px solid ${COLOR.line};border-radius:12px">` +
    // head: the Ventora logo (2x PNG shown at 160×44), or the wordmark without a platform URL
    `<div class="v-pad" style="padding:20px 24px;border-bottom:1px solid ${COLOR.line}">` +
    logo() +
    `</div>` +
    // body
    `<div class="v-pad" style="padding:24px">` +
    `<p style="${P_CAPTION};text-transform:uppercase;letter-spacing:.06em">${escapeHtml(e.eyebrow)}</p>` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:600;color:${COLOR.ink}">` +
    `${escapeHtml(e.title)}</h1>` +
    e.lead.map((t) => `<p style="${P_BODY}">${escapeHtml(t)}</p>`).join('') +
    button +
    e.after.map(afterHtml).join('') +
    (e.signature ? `<p style="${P_BODY};margin:16px 0 0">${escapeHtml(e.signature)}</p>` : '') +
    `</div></td></tr>` +
    // footer, outside the card
    `<tr><td class="v-pad" style="padding:16px 24px 0">` +
    `<p style="${P_CAPTION}">${escapeHtml(e.why)}</p>` +
    `<p style="${P_CAPTION}">${escapeHtml(e.company)}</p>` +
    `</td></tr></table></td></tr></table></body></html>`;

  const text =
    [
      e.title,
      ...e.lead,
      ...(e.button ? [`${e.button.label}: ${e.button.href}`] : []),
      ...e.after.map((a) => (typeof a === 'string' ? a : a.text)),
      ...(e.signature ? [e.signature] : []),
      '--',
      e.why,
      e.company,
    ].join('\n\n') + '\n';

  return { subject: e.subject, html, text };
}
