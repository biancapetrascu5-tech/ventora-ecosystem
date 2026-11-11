import { getTranslations } from 'next-intl/server';
import { readLauncher } from '@/server/launcher-actions';
import { readHubShell } from '@/server/shell-actions';
import { LauncherScreen } from '@/screens/launcher/LauncherScreen';

export const dynamic = 'force-dynamic';

/* Pagina principală Hub: launcher-ul (HubLauncher 1.1.0, Lotul 5.1). Starea fiecărei aplicații
   vine de pe server (readLauncher); fără afacere activă, textul simplu de până acum (Lot 2.9b). */
export default async function Page() {
  const [data, shell] = await Promise.all([readLauncher(), readHubShell()]);
  const business = shell?.orgs.find((o) => o.id === shell.currentOrgId);
  if (!data || !shell || !business) {
    const t = await getTranslations('hub.home');
    return <p className="body muted">{t('soon')}</p>;
  }
  return (
    <LauncherScreen
      data={data}
      userName={shell.user.name}
      businessName={business.name}
      now={new Date().toISOString()}
    />
  );
}
