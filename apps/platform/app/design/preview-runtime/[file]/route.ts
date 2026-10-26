import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const ALLOWED: Record<string, string> = {
  'react.production.min.js': 'application/javascript; charset=utf-8',
  'react-dom.production.min.js': 'application/javascript; charset=utf-8',
  'tokens.css': 'text/css; charset=utf-8',
};

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { file } = await params;
  const contentType = ALLOWED[file];
  if (!contentType) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'private/design-runtime', file);
  let arrayBuffer: ArrayBuffer;
  try {
    const buf = await readFile(filePath);
    arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(arrayBuffer, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  });
}
