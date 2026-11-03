/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (CAT, CATALOG_TX.ro) */
'use client';

import { AppShell, type AppName } from '@ventora/ui';
import { AppsView, type AppsGroup } from '@/screens/apps/AppsView';
import { HubBarLeading } from '../_shared/hubLauncher';
import { Bar, noop } from '../_shared/shell';
import c from '../_shared/founderCommercial.module.css';

// HubCatalog → „Hub — Catalogul aplicațiilor: toate cele 15, pe categorii, cu căutare” →
// Desktop · 1280 (H 1180). Recomandările (CampaignKit, ContractDesk) sunt doar în galerie: în
// aplicație, fără Growth Engine (S111), nu apar. Vederea e cea din Hub (/apps).
type St = 'own' | 'reco' | 'no';
const CAT: Array<[string, string, Array<[AppName, St]>]> = [
  [
    'clients',
    'Programări și clienți',
    [
      ['booking', 'own'],
      ['crm', 'own'],
      ['marketing', 'reco'],
      ['portal', 'own'],
    ],
  ],
  [
    'team',
    'Echipă',
    [
      ['hr', 'own'],
      ['shifts', 'own'],
    ],
  ],
  [
    'operations',
    'Operațiuni',
    [
      ['inventory', 'own'],
      ['assets', 'no'],
      ['events', 'no'],
    ],
  ],
  [
    'money',
    'Bani și documente',
    [
      ['finance', 'own'],
      ['contracts', 'reco'],
      ['documents', 'own'],
    ],
  ],
  [
    'projects',
    'Proiecte și date',
    [
      ['projects', 'own'],
      ['analytics', 'own'],
    ],
  ],
  ['community', 'Comunitate', [['network', 'no']]],
];
const DESC: Record<string, string> = {
  booking: 'Programări, calendar și reamintiri',
  crm: 'Clienți, istoric și oportunități',
  marketing: 'Campanii și reamintiri automate',
  portal: 'Pagina afacerii pentru clienți',
  hr: 'Echipă, prezență și concedii',
  shifts: 'Ture și înlocuiri',
  inventory: 'Stoc, comenzi și furnizori',
  assets: 'Echipamente, revizii și garanții',
  events: 'Evenimente, bilete și invitați',
  finance: 'Facturi, scadențe și restanțe',
  contracts: 'Contracte, semnături și termene',
  documents: 'Documente și șabloane',
  projects: 'Proiecte, sarcini și termene',
  analytics: 'Cifrele afacerii, pe luni și servicii',
  network: 'Comunitatea afacerilor Ventora Systems',
};
const RECO: Record<string, { reason: string; cost: string }> = {
  marketing: {
    reason: 'Se potrivește cu EasyBook: trimite automat reamintiri și campanii clienților tăi.',
    cost: '49 lei pe lună · fără cost de implementare',
  },
  contracts: {
    reason:
      'Se potrivește cu ClientDesk: contracte cu firmele din pipeline, cu semnătură și reamintire înainte de expirare.',
    cost: '59 lei pe lună · 300 lei implementare',
  },
};
const PRICE: Record<string, string> = {
  assets: '39 lei pe lună',
  events: '59 lei pe lună',
  network: 'Inclus în orice abonament, la cerere',
};

const GROUPS: AppsGroup[] = CAT.map(([id, title, apps]) => ({
  id,
  title,
  tiles: apps.map(([app, st]) =>
    st === 'own'
      ? { app, owned: true, description: `${DESC[app]} · în abonament`, onOpen: noop }
      : {
          app,
          owned: false,
          reason: `${DESC[app]}. ${PRICE[app] ?? ''}`,
          recommendation: RECO[app],
          onDetails: RECO[app] ? noop : undefined,
          onWriteUs: st === 'no' ? noop : undefined,
        },
  ),
}));

export function HubCatalogFrame() {
  return (
    <div className={c.xFrame}>
      <AppShell
        height="100%"
        contextBar={<Bar title="Toate aplicațiile" hub leading={<HubBarLeading />} />}
      >
        <AppsView
          phone={false}
          lead="15 aplicații care lucrează împreună. Ai 10 în abonament; la celelalte vezi ce fac, cât costă și dacă au perioadă de probă."
          query=""
          onQuery={noop}
          onlyMissing={false}
          onOnlyMissing={noop}
          groups={GROUPS}
        />
      </AppShell>
    </div>
  );
}
