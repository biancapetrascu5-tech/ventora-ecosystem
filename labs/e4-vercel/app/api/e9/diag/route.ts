import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { auth } = await import('@/lib/auth');
    const secret = !!process.env.BETTER_AUTH_SECRET;
    const dbUrl = !!process.env.DATABASE_URL_MULTI;
    return NextResponse.json({ ok: true, secret, dbUrl, authType: typeof auth });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
