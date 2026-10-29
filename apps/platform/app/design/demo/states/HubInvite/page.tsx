import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { InviteView } from '@/screens/auth/InviteView';
import { DEMO_INVITE } from '../../gallery/_shared/demo-data';

// HubInvite (expirată, din cadrul Telefon · Dark) + HubStates (cerere trimisă, anulată, folosită)
export default function HubInviteStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const p = { invite: DEMO_INVITE, name: 'Ioana Pavel', password: 'aurora2026', terms: true };
  return (
    <StateBoard
      title="HubInvite · stări"
      column={480}
      boxes={() => [
        ['Formularul (cerințe parțial bifate)', <InviteView key="a" {...p} />],
        ['Se acceptă', <InviteView key="b" {...p} state="loading" />],
        ['Invitația a expirat', <InviteView key="c" {...p} state="expired" />],
        ['Cerere trimisă', <InviteView key="d" {...p} state="requested" />],
        ['Anulată', <InviteView key="e" {...p} state="revoked" />],
        ['Folosită deja', <InviteView key="f" {...p} state="used" />],
      ]}
    />
  );
}
