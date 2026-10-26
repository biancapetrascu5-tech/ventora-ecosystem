import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const MIME: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

// Fișiere permise din docs/design/system — previne path traversal
const ALLOWED: Record<string, string> = {
  'bundle.js': 'components/bundle.js',
  'bundle.css': 'components/bundle.css',
};
const ALLOWED_FONT = /^[A-Za-z0-9._-]+\.woff2$/;

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  if (!segments || segments.length === 0 || segments.some((s) => s.includes('..'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const docsRoot = path.join(process.cwd(), '../../docs/design/system');
  let filePath: string;

  if (segments.length === 1 && ALLOWED[segments[0]]) {
    filePath = path.join(docsRoot, ALLOWED[segments[0]]);
  } else if (segments.length === 2 && segments[0] === 'fonts' && ALLOWED_FONT.test(segments[1])) {
    filePath = path.join(docsRoot, 'fonts', segments[1]);
  } else {
    return new NextResponse('Not found', { status: 404 });
  }

  let arrayBuffer: ArrayBuffer;
  try {
    const buf = await readFile(filePath);
    arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = path.extname(filePath);
  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}
