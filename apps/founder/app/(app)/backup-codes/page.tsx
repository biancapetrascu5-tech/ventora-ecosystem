import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { countBackupCodes, getFounderSession } from '@ventora/identity';
import { BackupCodesScreen } from '@/screens/codes/BackupCodesScreen';

export const dynamic = 'force-dynamic';

export default async function BackupCodesRoute() {
  const h = await headers();
  const session = await getFounderSession(h);
  if (!session) redirect('/sign-in');
  const left = (await countBackupCodes('founder', h).catch(() => null)) ?? undefined;
  return <BackupCodesScreen user={{ name: session.name }} left={left} />;
}
