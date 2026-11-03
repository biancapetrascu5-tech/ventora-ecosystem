import type { AppName } from '@ventora/ui';

/* Lotul 3.7 — HubCatalog: categoriile și ordinea aplicațiilor, ca în design (CAT din preview).
   Textele „Ce face” și „Se leagă de” există în design doar pentru CampaignKit; pentru celelalte
   aplicații pagina arată descrierea, prețul și ce include (raportul 3.7: texte cerute la Design). */

export const APP_GROUPS: ReadonlyArray<readonly [string, readonly AppName[]]> = [
  ['clients', ['booking', 'crm', 'marketing', 'portal']],
  ['team', ['hr', 'shifts']],
  ['operations', ['inventory', 'assets', 'events']],
  ['money', ['finance', 'contracts', 'documents']],
  ['projects', ['projects', 'analytics']],
  ['community', ['network']],
];

/** Câte rânduri „Ce face” are aplicația (hub.app.content.<app>.f1…) și de ce se leagă. */
export const APP_CONTENT: Partial<Record<AppName, { features: number; links: AppName[] }>> = {
  marketing: { features: 3, links: ['booking', 'crm', 'portal'] },
};
