/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (Lotul 3.4) */
'use client';
// Ecranele comerciale Founder din preview-uri (S111, S113), cu vederile din @ventora/screens ca în
// aplicația Founder; datele sunt cele din preview, nu prețuri aprobate (D3-1).
import { Stat, StatGroup, Tabs } from '@ventora/ui';
import {
  AppsView,
  BusinessBillingView,
  BusinessView,
  PacksView,
  RequestsView,
  UsageView,
  type AppRow,
  type DiscountRow,
  type PackRow,
  type RequestRow,
} from '@ventora/screens';
import { FounderShellDemo } from './founderShell';
import { noop } from './shell';
import c from './founderCommercial.module.css';

const PACKS: PackRow[] = [
  {
    id: 1,
    name: '500 SMS în plus',
    price: '49 lei · 10 €',
    period: 'o dată, perioada în curs',
    setup: 'Fără',
    availableFor: 'Cu EasyBook',
    direct: true,
  },
  {
    id: 2,
    name: '200 de programări în plus',
    price: '39 lei · 8 €',
    period: 'o dată, perioada în curs',
    setup: 'Fără',
    availableFor: 'Cu EasyBook',
    direct: true,
  },
  {
    id: 3,
    name: '10 campanii în plus',
    price: '39 lei · 8 €',
    period: 'o dată, perioada în curs',
    setup: 'Fără',
    availableFor: 'Cu CampaignKit',
    direct: true,
  },
  {
    id: 4,
    name: '5 locuri în echipă în plus',
    price: '60 lei · 12 €',
    period: 'lunar, cu abonamentul',
    setup: 'Fără',
    availableFor: 'Toate afacerile',
    direct: true,
  },
  {
    id: 5,
    name: 'Domeniu propriu pentru pagina de rezervări',
    price: '25 lei · 5 €',
    period: 'lunar',
    setup: '150 lei · 30 €',
    availableFor: 'Cu EasyBook',
    direct: false,
  },
];

/** FounderPacks → Screens → Desktop · 1280 (H 800). */
export function FounderPacksFrame() {
  return (
    <div className={c.frameRel}>
      <FounderShellDemo active="pachete" title="Pachete în plus">
        <PacksView phone={false} rows={PACKS} onNew={noop} onEdit={noop} onStop={noop} />
      </FounderShellDemo>
    </div>
  );
}

const APPS_P: AppRow[] = [
  {
    id: 'booking',
    app: 'booking',
    maintenance: { lei: '149 lei · 1.490 lei', eur: '30 € · 300 €' },
    maintenanceShort: 'Mentenanță 149 lei pe lună · 30 €',
    setup: { lei: '300 lei', eur: '60 €' },
    setupShort: 'Implementare 300 lei · 60 €',
    limits: ['1.000 de programări pe lună', '500 SMS pe lună'],
    direct: true,
  },
  {
    id: 'crm',
    app: 'crm',
    maintenance: { lei: '69 lei · 690 lei', eur: '14 € · 140 €' },
    maintenanceShort: 'Mentenanță 69 lei pe lună · 14 €',
    setup: { lei: '200 lei', eur: '40 €' },
    setupShort: 'Implementare 200 lei · 40 €',
    limits: ['5.000 de clienți'],
    direct: true,
  },
  {
    id: 'hr',
    app: 'hr',
    maintenance: { lei: '69 lei · 690 lei', eur: '14 € · 140 €' },
    maintenanceShort: 'Mentenanță 69 lei pe lună · 14 €',
    setup: { lei: '200 lei', eur: '40 €' },
    setupShort: 'Implementare 200 lei · 40 €',
    limits: [],
    direct: true,
  },
  {
    id: 'finance',
    app: 'finance',
    maintenance: { lei: '79 lei · 790 lei', eur: '16 € · 160 €' },
    maintenanceShort: 'Mentenanță 79 lei pe lună · 16 €',
    setup: { lei: '250 lei', eur: '50 €' },
    setupShort: 'Implementare 250 lei · 50 €',
    limits: ['300 de facturi pe lună'],
    direct: true,
  },
  {
    id: 'marketing',
    app: 'marketing',
    maintenance: { lei: '49 lei · 490 lei', eur: '10 € · 100 €' },
    maintenanceShort: 'Mentenanță 49 lei pe lună · 10 €',
    setup: { lei: '150 lei', eur: '30 €' },
    setupShort: 'Implementare 150 lei · 30 €',
    limits: ['10 campanii pe lună', '2.000 de e-mailuri pe lună'],
    direct: true,
  },
  {
    id: 'analytics',
    app: 'analytics',
    maintenance: { lei: '59 lei · 590 lei', eur: '12 € · 120 €' },
    maintenanceShort: 'Mentenanță 59 lei pe lună · 12 €',
    setup: null,
    setupShort: 'Fără cost de implementare',
    limits: [],
    direct: true,
  },
  {
    id: 'documents',
    app: 'documents',
    maintenance: { lei: '29 lei · 290 lei', eur: '6 € · 60 €' },
    maintenanceShort: 'Mentenanță 29 lei pe lună · 6 €',
    setup: null,
    setupShort: 'Fără cost de implementare',
    limits: ['5 GB spațiu pentru documente'],
    direct: true,
  },
  {
    id: 'shifts',
    app: 'shifts',
    maintenance: { lei: '39 lei · 390 lei', eur: '8 € · 80 €' },
    maintenanceShort: 'Mentenanță 39 lei pe lună · 8 €',
    setup: { lei: '150 lei', eur: '30 €' },
    setupShort: 'Implementare 150 lei · 30 €',
    limits: [],
    direct: false,
  },
  {
    id: 'inventory',
    app: 'inventory',
    maintenance: { lei: '69 lei · 690 lei', eur: '14 € · 140 €' },
    maintenanceShort: 'Mentenanță 69 lei pe lună · 14 €',
    setup: { lei: '400 lei', eur: '80 €' },
    setupShort: 'Implementare 400 lei · 80 €',
    limits: ['2.000 de produse'],
    direct: false,
  },
  {
    id: 'contracts',
    app: 'contracts',
    maintenance: { lei: '49 lei · 490 lei', eur: '10 € · 100 €' },
    maintenanceShort: 'Mentenanță 49 lei pe lună · 10 €',
    setup: { lei: '350 lei', eur: '70 €' },
    setupShort: 'Implementare 350 lei · 70 €',
    limits: ['100 de contracte pe lună'],
    direct: false,
  },
  {
    id: 'events',
    app: 'events',
    maintenance: { lei: '59 lei · 590 lei', eur: '12 € · 120 €' },
    maintenanceShort: 'Mentenanță 59 lei pe lună · 12 €',
    setup: null,
    setupShort: 'Fără cost de implementare',
    limits: ['5 evenimente pe lună'],
    direct: true,
  },
];

/** FounderApps (S117) → „1 · Lista aplicațiilor” → Desktop · 1280 (H 1040). */
export function FounderAppsFrame() {
  return (
    <div className={c.frameRel}>
      <FounderShellDemo active="aplicatii" title="Aplicații">
        <AppsView phone={false} rows={APPS_P} onToggle={noop} onEdit={noop} />
      </FounderShellDemo>
    </div>
  );
}

/** FounderUsage → Screens → Desktop · 1280 (H 1200). */
export function FounderUsageFrame() {
  return (
    <FounderShellDemo active="consum" title="Consum">
      <UsageView
        phone={false}
        lead="Cum se folosesc limitele în toate afacerile, în octombrie, până azi."
        stats={
          <StatGroup>
            <Stat
              label="Afaceri peste 80% la o limită"
              value="9"
              tone="attention"
              hint="3 au atins limita"
              onClick={noop}
            />
            <Stat
              label="SMS-uri trimise"
              value="61.240"
              delta={{ value: '+11%', period: 'față de septembrie' }}
            />
            <Stat
              label="Programări create"
              value="48.900"
              delta={{ value: '+8%', period: 'față de septembrie' }}
            />
            <Stat label="Pachete în plus vândute" value="37" hint="1.693 lei" />
          </StatGroup>
        }
        byResource={[
          { label: 'SMS-uri', value: 5 },
          { label: 'Locuri în echipă', value: 2 },
          { label: 'Programări', value: 1 },
          { label: 'Spațiu documente', value: 1 },
        ]}
        daily={{
          title: 'SMS-uri trimise pe zi',
          description: 'Octombrie · azi e încă în curs',
          labels: ['1', '4', '7', '10', '13', '16', '19', '22', '24'],
          values: [1700, 1900, 2050, 1980, 2200, 2310, 2280, 2400, 2120],
          nowIndex: 8,
        }}
        rows={[
          {
            id: 1,
            business: 'Salon Aurora',
            resource: 'Locuri în echipă',
            usage: '10 din 10',
            estimate: 'Atinsă',
            status: 'La limită',
          },
          {
            id: 2,
            business: 'Clinica Dentis Sibiu',
            resource: 'SMS-uri',
            usage: '920 din 1.000',
            estimate: '26 oct.',
            status: '92%',
          },
          {
            id: 3,
            business: 'Fitness Atlas',
            resource: 'SMS-uri',
            usage: '2.610 din 3.000',
            estimate: '29 oct.',
            status: '87%',
          },
        ]}
        onOpen={noop}
        onException={noop}
      />
    </FounderShellDemo>
  );
}

const REQUESTS: RequestRow[] = [
  {
    id: 1,
    business: 'Clinica Dentis Sibiu',
    who: 'Andrei Mureșan (proprietar)',
    type: 'activation',
    item: 'Domeniu propriu pentru pagina de rezervări',
    when: 'azi, 10:12',
    status: 'new',
  },
  {
    id: 2,
    business: 'Salon Aurora',
    who: 'Ioana Pavel (proprietar)',
    type: 'plan',
    item: 'Business Plus',
    when: 'ieri, 17:40',
    status: 'new',
  },
];

/** FounderRequests → „1 · Cererile noi” → Desktop · 1280 (H 860). */
export function FounderRequestsFrame() {
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo active="cereri" title="Cereri">
          <RequestsView
            rows={REQUESTS}
            filter="new"
            onFilterChange={noop}
            newCount={2}
            onOpen={noop}
            onResolve={noop}
            onRefuse={noop}
          />
        </FounderShellDemo>
      </div>
    </div>
  );
}

const DISC: DiscountRow[] = [
  {
    id: 1,
    what: 'Tot abonamentul',
    value: '15%',
    duration: '5 luni',
    reason: 'Client din primul val',
    by: 'Bianca Petrașcu · 1 mar.',
  },
  {
    id: 2,
    what: 'CampaignKit · aplicație adăugată',
    value: '100%',
    duration: 'Permanentă',
    reason: 'Partener de test pentru campanii',
    by: 'Bianca Petrașcu · 12 oct.',
  },
  {
    id: 3,
    what: '5 locuri în echipă în plus',
    value: '20 lei',
    duration: 'O singură dată',
    reason: 'Compensare pentru întreruperea din 9 oct.',
    by: 'Mihai Ionescu · 10 oct.',
  },
];

const TABS = [
  { id: 'o', label: 'Prezentare' },
  { id: 'c', label: 'Consum' },
  { id: 'e', label: 'Excepții', count: 2 },
  { id: 'f', label: 'Plăți și facturi' },
  { id: 'j', label: 'Jurnal' },
];

/** FounderDiscounts → „1 · Reducerile active ale afacerii” → Desktop · 1280 (H 760). */
export function FounderDiscountsFrame() {
  return (
    <div className={c.xFrame}>
      <FounderShellDemo active="afaceri" title="Clinica Dentis Sibiu">
        <BusinessView
          phone={false}
          name="Clinica Dentis Sibiu"
          meta="Business · v2 · Moneda: lei"
          menu={[]}
          onMenuAction={noop}
          owner={null}
          recent={[]}
          tabs={<Tabs label="Afacere" defaultSelectedKey="f" items={TABS} />}
          full={
            <BusinessBillingView
              phone={false}
              plan={{
                strong: 'Plătește lunar: 349 lei',
                rest: 'se reînnoiește pe 17 noiembrie',
                note: 'Plătește cu cardul Visa ···· 4242 · Consumul pornește de la zero pe 17 ale fiecărei luni.',
              }}
              discounts={DISC}
              canAdd
              onAdd={noop}
              onEdit={noop}
              onEnd={noop}
            />
          }
        />
      </FounderShellDemo>
    </div>
  );
}
