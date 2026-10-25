import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { auth } = await import('@/lib/auth');
    const secret = !!process.env.BETTER_AUTH_SECRET;
    const dbUrl = !!process.env.DATABASE_URL_MULTI;

    // Call auth handler with a synthetic /ok request
    const testUrl = new URL('/api/e9/auth/ok', req.url);
    const testReq = new Request(testUrl.toString(), { method: 'GET', headers: req.headers });
    let handlerResult: string;
    try {
      const res = await auth.handler(testReq);
      handlerResult = `${res.status}: ${await res.text()}`;
    } catch (he) {
      handlerResult = `throw: ${he instanceof Error ? he.message : String(he)}`;
    }

    return NextResponse.json({ ok: true, secret, dbUrl, authType: typeof auth, handlerResult });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
