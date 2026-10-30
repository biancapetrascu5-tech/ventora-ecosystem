import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@ventora/identity';
import { acceptInviteFor, PENDING_INVITE_COOKIE, PENDING_INVITE_MAX_AGE } from '@/server/invite';
import { routeSignedIn } from '@/server/route';

export const dynamic = 'force-dynamic';

/* Invitație pentru un cont care există deja (Lot 2.6 · E; varianta nu are ecran desenat, DE
   VALIDAT). Cu sesiune: invitația e acceptată pentru contul din sesiune și afacerea se deschide.
   Fără sesiune: tokenul așteaptă intrarea într-un cookie httpOnly (o oră), routeAfterSignIn îl
   acceptă după parolă și cod. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSession(req.headers);
  if (session) {
    // Altă adresă decât cea invitată (alt cont în sesiune) sau invitația s-a folosit între
    // timp: nu se acceptă nimic, rămâne în Hub cu contul lui.
    const res = await acceptInviteFor(token, session.userId);
    const to = res.ok ? await routeSignedIn(session, res.organizationId) : '/';
    return NextResponse.redirect(new URL(to, req.url));
  }
  const response = NextResponse.redirect(new URL('/sign-in', req.url));
  response.cookies.set(PENDING_INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    maxAge: PENDING_INVITE_MAX_AGE,
  });
  return response;
}
