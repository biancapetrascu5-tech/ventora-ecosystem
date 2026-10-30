import { getResetLinkInfo } from '@ventora/identity';
import { ResetPasswordScreen, type ResetLinkInfo } from '@ventora/screens';

export const dynamic = 'force-dynamic';

/* Linkul din e-mail: /reset-password?token=… (core/notifications, B-4). La deschidere serverul
   spune ce știe despre token (Lot 2.6 · C): valid / expirat (cu adresa), folosit, necunoscut. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  const link: ResetLinkInfo = await getResetLinkInfo('hub', token).catch(() => ({
    status: 'unknown' as const,
  }));
  return <ResetPasswordScreen token={token} link={link} />;
}
