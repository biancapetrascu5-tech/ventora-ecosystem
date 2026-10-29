import { headers } from 'next/headers';
import { founderAuth } from '@ventora/identity';
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';

export const dynamic = 'force-dynamic';

/* Linkul din e-mail Founder: /reset-password?token=… (core/notifications, B-4). La deschidere întrebăm
   Better Auth (GET /reset-password/:token) dacă tokenul există și nu a expirat; nu-l consumă. */
async function isLinkValid(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const host = (await headers()).get('host') ?? 'localhost';
    const url = `http://${host}/api/auth/reset-password/${encodeURIComponent(token)}?callbackURL=${encodeURIComponent('/reset-password')}`;
    const res = await founderAuth.handler(new Request(url, { headers: { host } }));
    return !(res.headers.get('location') ?? '').includes('error=');
  } catch {
    // Fără răspuns arătăm formularul; salvarea spune dacă linkul mai e bun.
    return true;
  }
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <ResetPasswordScreen token={token} linkValid={await isLinkValid(token)} />;
}
