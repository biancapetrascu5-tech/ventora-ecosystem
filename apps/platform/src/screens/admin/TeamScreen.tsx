'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { APP_IDS, type AppName } from '@ventora/ui';
import { useDates } from '@ventora/screens';
import { cancelInvite, readTeam, resendInvite, type TeamData } from '@/server/team-actions';
import { TeamView, type TeamInviteRow, type TeamMemberRow } from './TeamView';

/* HubAdminTeam (Lot 2.8): datele vin din readTeam; „Retrimite” și „Anulează invitația” reîncarcă
   lista (retrimiterea șterge marcajul „A cerut o invitație nouă”). */

const isApp = (id: string): id is AppName => (APP_IDS as string[]).includes(id);

export function TeamScreen({ initial }: { initial: TeamData }) {
  const roles = useTranslations('roles');
  const dates = useDates();
  const [data, setData] = useState(initial);

  const role = (r: string) => (roles.has(r) ? roles(r) : r);
  const members: TeamMemberRow[] = data.members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: role(m.role),
    apps: m.applicationIds ? m.applicationIds.filter(isApp) : null,
    stopped: m.status === 'suspended',
    owner: m.role === 'owner',
  }));
  const invites: TeamInviteRow[] = data.invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: role(i.role),
    sent: dates.day(new Date(i.createdAt)),
    until: dates.day(new Date(i.expiresAt)),
    expired: i.status === 'expired',
    newLinkRequested: !!i.newLinkRequestedAt,
  }));

  async function reload() {
    const next = await readTeam();
    if (next) setData(next);
  }

  return (
    <TeamView
      business={data.business}
      members={members}
      invites={invites}
      onResend={async (r) => {
        await resendInvite(r.id);
        await reload();
      }}
      onCancel={async (r) => {
        await cancelInvite(r.id);
        await reload();
      }}
    />
  );
}
