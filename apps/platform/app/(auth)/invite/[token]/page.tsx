import { notFound, redirect } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { hasAccountForEmail } from '@ventora/identity';
import { getInvitationByToken } from '@ventora/organizations';
import { APPS, type AppName } from '@ventora/ui';
import type { InviteState } from '@ventora/screens';
import { InviteScreen } from '@/screens/auth/InviteScreen';

export const dynamic = 'force-dynamic';

const SYSTEM_ROLES = ['owner', 'admin', 'member', 'external_collaborator', 'application_manager'];

const STATE: Record<'expired' | 'accepted' | 'revoked', InviteState> = {
  expired: 'expired',
  accepted: 'used',
  revoked: 'revoked',
};

/* Linkul din invitație: /invite/{token} (core/notifications). Serverul spune ce știe despre
   token (Lot 2.6 · E); un token necunoscut nu spune nimic (404). Un cont care există deja
   intră întâi (continue/route.ts), apoi invitația e acceptată. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvitationByToken(token);
  if (!invite) notFound();
  if (invite.status === 'pending' && (await hasAccountForEmail(invite.email)))
    redirect(`/invite/${token}/continue`);

  const roles = await getTranslations('roles');
  const format = await getFormatter();
  return (
    <InviteScreen
      token={token}
      initialState={invite.status === 'pending' ? 'form' : STATE[invite.status]}
      invite={{
        inviterName: invite.inviterName,
        businessName: invite.organizationName,
        roleName: SYSTEM_ROLES.includes(invite.role) ? roles(invite.role) : invite.role,
        apps: invite.applicationIds.filter((id): id is AppName => id in APPS),
        email: invite.email,
        expires: format.dateTime(invite.expiresAt, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      }}
    />
  );
}
