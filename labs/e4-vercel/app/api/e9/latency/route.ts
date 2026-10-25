import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const session = await auth.api.getSession({ headers: req.headers });
  const elapsed = performance.now() - t0;
  return NextResponse.json({
    authenticated: !!session,
    sessionLookupMs: Math.round(elapsed * 100) / 100,
  });
}
