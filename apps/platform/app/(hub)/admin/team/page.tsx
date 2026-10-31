import { notFound } from 'next/navigation';
import { readTeam } from '@/server/team-actions';
import { TeamScreen } from '@/screens/admin/TeamScreen';

export const dynamic = 'force-dynamic';

/* Administrare · Echipă și invitații (HubAdminTeam, Lot 2.8). Doar owner și admin; un membru
   (sau o afacere suspendată) primește 404, iar contractele îl refuză oricum pe server. */
export default async function AdminTeamPage() {
  const initial = await readTeam();
  if (!initial) notFound();
  return <TeamScreen initial={initial} />;
}
