// One layout for every transactional email: an HTML version (inline styles, the only kind
// mail clients honour) and a plain-text version with the same content.
// Colours are the light-theme tokens from docs/design/system/tokens.json.
const COLOR = {
  canvas: '#F2F3F0',
  sheet: '#FFFFFF',
  ink: '#000C3F',
  inkMuted: '#5E6680',
  primary: '#000C3F',
  onPrimary: '#FFFFFF',
} as const;

export type Block =
  | { kind: 'text'; text: string; strong?: boolean }
  | { kind: 'button'; label: string; href: string }
  | { kind: 'footer'; text: string };

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

function blockHtml(block: Block): string {
  switch (block.kind) {
    case 'text': {
      const body = escapeHtml(block.text);
      return `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${
        block.strong ? `<strong>${body}</strong>` : body
      }</p>`;
    }
    case 'button':
      return (
        `<p style="margin:8px 0 24px"><a href="${escapeHtml(block.href)}" ` +
        `style="display:inline-block;background:${COLOR.primary};color:${COLOR.onPrimary};` +
        `text-decoration:none;font-weight:600;font-size:16px;line-height:24px;` +
        `padding:12px 20px;border-radius:6px">${escapeHtml(block.label)}</a></p>`
      );
    case 'footer':
      return `<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:${COLOR.inkMuted}">${escapeHtml(block.text)}</p>`;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'text':
    case 'footer':
      return block.text;
    case 'button':
      return `${block.label}: ${block.href}`;
  }
}

export function renderLayout(lang: string, subject: string, blocks: Block[]): RenderedEmail {
  const html =
    `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${COLOR.canvas};color:${COLOR.ink};` +
    `font-family:'DM Sans',Arial,Helvetica,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" style="padding:32px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="max-width:560px;background:${COLOR.sheet};border-radius:8px"><tr>` +
    `<td style="padding:32px">${blocks.map(blockHtml).join('')}</td>` +
    `</tr></table></td></tr></table></body></html>`;
  const text = blocks.map(blockText).join('\n\n') + '\n';
  return { subject, html, text };
}
