import { getTranslations } from 'next-intl/server';

/* Pagina principală Hub, până la launcher (HubLauncher): un text normal în locul celui tehnic
   (Lot 2.9b, punctul 7). */
export default async function Page() {
  const t = await getTranslations('hub.home');
  return <p className="body muted">{t('soon')}</p>;
}
