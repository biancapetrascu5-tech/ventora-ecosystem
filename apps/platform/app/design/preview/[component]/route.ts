import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Injectat în <head> al fiecărui preview.html din docs/design/system/components/
// React 18 UMD local → nu atinge React 19 al aplicației Next.js
// bundle.js + bundle.css + fonts — servite direct din docs/design/system fără copii
const RUNTIME_HEAD = `\
<style>
@font-face{font-family:'DM Sans';src:url('/design/preview-assets/fonts/DMSans-Variable.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap}
@font-face{font-family:'DM Sans';src:url('/design/preview-assets/fonts/DMSans-Italic-Variable.woff2') format('woff2');font-style:italic;font-weight:100 900;font-display:swap}
@font-face{font-family:'Syne';src:url('/design/preview-assets/fonts/Syne-Variable.woff2') format('woff2');font-style:normal;font-weight:400 800;font-display:swap}
</style>
<link rel="stylesheet" href="/design/preview-runtime/tokens.css">
<link rel="stylesheet" href="/design/preview-assets/bundle.css">
<script src="/design/preview-runtime/react.production.min.js"></script>
<script src="/design/preview-runtime/react-dom.production.min.js"></script>
<script src="/design/preview-assets/bundle.js"></script>`;

export async function GET(_req: Request, { params }: { params: Promise<{ component: string }> }) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { component } = await params;

  // Previne path traversal — doar litere și cifre
  if (!/^[A-Za-z0-9]+$/.test(component)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const previewPath = path.join(
    process.cwd(),
    '../../docs/design/system/components',
    component,
    'preview.html',
  );

  let raw: string;
  try {
    raw = await readFile(previewPath, 'utf-8');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  // Elimină comentariul @dsCard de deasupra <!doctype> și injectează runtime după <meta charset>
  const html = raw
    .replace(/^<!--[\s\S]*?-->\s*/m, '')
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n${RUNTIME_HEAD}`);

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
