import { redirect } from 'next/navigation';
import { readHubShell } from '@/server/shell-actions';
import { ProfilePhotoPage } from '@/screens/account/ProfilePhotoPage';

export const dynamic = 'force-dynamic';

/* Contul tău › Profil și preferințe (HubAccount, S147): deocamdată poza de profil. Persoana vine
   din sesiune (readHubShell); fără sesiune → autentificare. */
export default async function ProfilePage() {
  const shell = await readHubShell();
  if (!shell) redirect('/sign-in');
  const current = shell.orgs.find((o) => o.id === shell.currentOrgId) ?? null;
  return (
    <ProfilePhotoPage
      name={shell.user.name}
      photo={shell.user.avatar ?? null}
      org={current ? { name: current.name, role: current.role, logo: current.logo } : null}
    />
  );
}
