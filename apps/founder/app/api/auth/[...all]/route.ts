import { founderAuth, setAuthBackgroundTaskHandler } from '@ventora/identity';
import { after, type NextRequest } from 'next/server';

// The password reset email leaves after the response, kept alive by after() (B-6).
setAuthBackgroundTaskHandler((task) => after(task));

async function handler(req: NextRequest) {
  return founderAuth.handler(req);
}

export { handler as GET, handler as POST };
