import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ session: null }, { status: 401 });
  return NextResponse.json({ session });
}
