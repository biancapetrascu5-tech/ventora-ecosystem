import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { founderAuth } from '@ventora/identity';

const PUBLIC_PATHS = [
  '/api/auth/sign-in/email',
  '/api/auth/sign-up/email',
  '/api/auth/two-factor/verify',
  '/api/auth/two-factor/enable',
  '/api/auth/session',
  '/api/auth/callback',
];

const ALLOWED_BEFORE_2FA = new Set(['/api/auth/two-factor', '/setup-2fa']);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isAllowedBefore2fa(pathname: string): boolean {
  for (const p of ALLOWED_BEFORE_2FA) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = await founderAuth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json({ error: 'NotAuthenticated' }, { status: 401 });
  }

  const twoFactorVerified = (session as { session: { twoFactorVerified?: boolean } }).session
    .twoFactorVerified;

  if (!twoFactorVerified && !isAllowedBefore2fa(pathname)) {
    return NextResponse.json(
      { error: 'TwoFactorRequired', redirectTo: '/setup-2fa' },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next|favicon.ico).*)'],
};
