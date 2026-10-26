import { hubAuth } from '@ventora/identity';
import type { NextRequest } from 'next/server';

async function handler(req: NextRequest) {
  return hubAuth.handler(req);
}

export { handler as GET, handler as POST };
