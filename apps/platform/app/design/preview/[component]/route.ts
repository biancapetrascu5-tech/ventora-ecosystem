import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Injectat în <head> al fiecărui preview.html din docs/design/system/components/
// React 18 UMD local → nu atinge React 19 al aplicației Next.js
const RUNTIME_HEAD = `\
<link rel="stylesheet" href="/preview-runtime/fonts.css">
<link rel="stylesheet" href="/preview-runtime/tokens.css">
<link rel="stylesheet" href="/preview-runtime/bundle.css">
<script src="/preview-runtime/react.production.min.js"></script>
<script src="/preview-runtime/react-dom.production.min.js"></script>
<script src="/preview-runtime/bundle.js"></script>`;

export async function GET(_req: Request, { params }: { params: Promise<{ component: string }> }) {
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
