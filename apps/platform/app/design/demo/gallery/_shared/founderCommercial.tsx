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
    plans: 'Toate',
    direct: true,
  },
  {
    id: 2,
    name: '200 de programări în plus',
    price: '39 lei · 8 €',
    period: 'o dată, perioada în curs',
    setup: 'Fără',
    plans: 'Start, Business',
    direct: true,
  },
  {
    id: 3,
    name: '10 campanii în plus',
    price: '39 lei · 8 €',
    period: 'o dată, perioada în curs',
    setup: 'Fără',
    plans: 'Toate',
    direct: true,
  },
  {
    id: 4,
    name: '5 locuri în echipă în plus',
    price: '60 lei · 12 €',
    period: 'lunar, cu abonamentul',
    setup: 'Fără',
    plans: 'Business, Business Plus',
    direct: true,
  },
  {
    id: 5,
    name: 'Domeniu propriu pentru pagina de rezervări',
    price: '25 lei · 5 €',
    period: 'lunar',
    setup: '150 lei · 30 €',
    plans: 'Business Plus',
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
    id: 'marketing',
    app: 'marketing',
    price: '49 lei · 10 €',
    setup: 'Fără',
    hasSetup: false,
    direct: true,
  },
  {
    id: 'analytics',
    app: 'analytics',
    price: '59 lei · 12 €',
    setup: 'Fără',
    hasSetup: false,
    direct: true,
  },
  {
    id: 'documents',
    app: 'documents',
    price: '29 lei · 6 €',
    setup: 'Fără',
    hasSetup: false,
    direct: true,
  },
  {
    id: 'shifts',
    app: 'shifts',
    price: '39 lei · 8 €',
    setup: 'Fără',
    hasSetup: false,
    direct: false,
  },
  {
    id: 'inventory',
    app: 'inventory',
    price: '69 lei · 14 €',
    setup: '300 lei · 60 €',
    hasSetup: true,
    direct: false,
  },
  {
    id: 'contracts',
    app: 'contracts',
    price: '49 lei · 10 €',
    setup: '250 lei · 50 €',
    hasSetup: true,
    direct: false,
  },
  {
    id: 'events',
    app: 'events',
    price: '59 lei · 12 €',
    setup: 'Fără',
    hasSetup: false,
    direct: true,
  },
];

/** FounderApps → „1 · Lista aplicațiilor” → Desktop · 1280 (H 760). */
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
