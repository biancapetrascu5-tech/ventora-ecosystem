import { hubAuth } from '@ventora/identity';
import { checkRateLimit } from '@ventora/identity';
import type { NextRequest } from 'next/server';

async function handler(req: NextRequest) {
  const url = new URL(req.url);

  if (url.pathname.endsWith('/sign-in/email') && req.method === 'POST') {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '0.0.0.0';
    const rateCheck = await checkRateLimit(`login:${ip}`);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: 'TooManyRequests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateCheck.retryAfter ?? 60),
        },
      });
    }
  }

  return hubAuth.handler(req);
}

export { handler as GET, handler as POST };
