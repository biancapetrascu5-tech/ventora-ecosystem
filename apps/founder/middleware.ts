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
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
  '/api/auth/request-new-reset-link',
];

// Ecranele de autentificare (Faza 2 · D) se deschid fără sesiune.
const PUBLIC_PAGES = ['/sign-in', '/forgot-password', '/reset-password', '/two-factor'];

const ALLOWED_BEFORE_2FA = new Set(['/api/auth/two-factor', '/api/auth/sign-out', '/setup-2fa']);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAllowedBefore2fa(pathname: string): boolean {
  for (const p of ALLOWED_BEFORE_2FA) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isApi = pathname.startsWith('/api/');

  if (isPublicPath(pathname) || isPublicPage(pathname)) {
    return NextResponse.next();
  }

  const session = await founderAuth.api.getSession({ headers: req.headers });

  if (!session) {
    return isApi
      ? NextResponse.json({ error: 'NotAuthenticated' }, { status: 401 })
      : NextResponse.redirect(new URL('/sign-in', req.url));
  }

  // Cu 2FA activ, Better Auth deschide sesiunea abia după cod; fără 2FA, Founder-ul trebuie să-l
  // activeze întâi (T1.8). Câmpul `session.twoFactorVerified` folosit înainte nu există: blocare
  // permanentă a oricărei pagini (abatere corectată în Faza 2 · D).
  const twoFactorEnabled = (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled;

  if (!twoFactorEnabled && !isAllowedBefore2fa(pathname)) {
    return isApi
      ? NextResponse.json({ error: 'TwoFactorRequired', redirectTo: '/setup-2fa' }, { status: 403 })
      : NextResponse.redirect(new URL('/setup-2fa', req.url));
  }

  return NextResponse.next();
}

// Better Auth + Prisma au nevoie de Node.js (în Edge, dev-ul dădea 500 pe orice pagină).
export const config = {
  runtime: 'nodejs',
  matcher: ['/api/:path*', '/((?!_next|favicon.ico).*)'],
};
