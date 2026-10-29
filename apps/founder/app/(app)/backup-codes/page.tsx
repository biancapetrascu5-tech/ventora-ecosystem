import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFounderSession } from '@ventora/identity';
import { BackupCodesScreen } from '@/screens/codes/BackupCodesScreen';

export const dynamic = 'force-dynamic';

export default async function BackupCodesRoute() {
  const session = await getFounderSession(await headers());
  if (!session) redirect('/sign-in');
  return <BackupCodesScreen user={{ name: session.name }} />;
}
