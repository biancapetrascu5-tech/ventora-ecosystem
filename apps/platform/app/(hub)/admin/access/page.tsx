import { notFound } from 'next/navigation';
import { readSupportSessions } from '@/server/support-actions';
import { SupportSessionsScreen } from '@/screens/support/SupportSessionsScreen';

export const dynamic = 'force-dynamic';

/* Administrare · Roluri și acces: aici doar secțiunea „Sesiuni de suport” (S91). Matricea
   rol × aplicație (HubAdminAccess) nu face parte din lot. Fără drept de citire (sau fără sesiune) → 404. */
export default async function AdminAccessPage() {
  const initial = await readSupportSessions(1);
  if (!initial) notFound();
  return <SupportSessionsScreen initial={initial} />;
}
