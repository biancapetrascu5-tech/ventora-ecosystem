/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (S117) */
'use client';
// FounderPlans 2.0.0 → „Bundle-uri” și FounderPlanEditor 2.0.0 → „Ofertă nouă” (S117), cu vederile
// din @ventora/screens ca în aplicația Founder (FounderBundles în cod). Datele sunt cele din
// preview, nu prețuri aprobate (D3-1).
import {
  BundleEditorBar,
  BundleEditorView,
  BundlesView,
  type BundleCardData,
  type BundleEditorState,
} from '@ventora/screens';
import { FounderShellDemo } from './founderShell';
import { noop } from './shell';
import c from './founderCommercial.module.css';

const BUNDLES: BundleCardData[] = [
  {
    id: 'business',
    name: 'Business',
    status: 'selling',
    statusText: 'În vânzare',
    subline: 'Disponibil 1–30 noiembrie · 55 de afaceri îl au',
    apps: ['booking', 'crm', 'hr', 'finance'],
    price: {
      month: '319 lei pe lună',
      monthEur: '64 €',
      year: '3.190 lei pe an',
      yearEur: '640 €',
    },
    separate: {
      month: '366 lei pe lună',
      monthEur: '74 €',
      saving: 'Economie: 47 lei pe lună (13%)',
    },
    includes: [
      '1.500 de programări pe lună',
      '1.500 SMS pe lună',
      '7 locuri în echipă în plus (10 cu cele din cont)',
      'Implementare: 600 lei, o singură dată (separat: 950 lei)',
    ],
    versions: [
      {
        id: 'b2',
        label: 'v2',
        pill: { tone: 'done', text: 'Oferta de acum' },
        sale: '1–30 nov. 2026',
        month: { lei: '319 lei', eur: '64 €' },
        year: { lei: '3.190 lei', eur: '640 €' },
        businesses: 9,
        businessesAria: '9 afaceri pe Business v2, vezi lista',
      },
      {
        id: 'b1',
        label: 'v1',
        pill: { tone: 'neutral', text: 'Încheiată' },
        sale: '1 sep. – 31 oct. 2026',
        month: { lei: '300 lei', eur: '60 €' },
        year: { lei: '3.000 lei', eur: '600 €' },
        businesses: 46,
        businessesAria: '46 de afaceri pe Business v1, vezi lista',
      },
    ],
    keepNote: true,
  },
  {
    id: 'plus',
    name: 'Business Plus',
    status: 'selling',
    statusText: 'În vânzare',
    subline: 'Disponibil 1–30 noiembrie · 3 afaceri îl au',
    apps: ['booking', 'crm', 'hr', 'finance', 'marketing', 'shifts', 'documents'],
    price: {
      month: '399 lei pe lună',
      monthEur: '80 €',
      year: '3.990 lei pe an',
      yearEur: '800 €',
    },
    separate: {
      month: '483 lei pe lună',
      monthEur: '98 €',
      saving: 'Economie: 84 lei pe lună (17%)',
    },
    includes: [
      '3.000 de programări pe lună',
      '3.000 SMS pe lună',
      '20 GB spațiu pentru documente',
      '17 locuri în echipă în plus (20 cu cele din cont)',
      'Implementare: 800 lei, o singură dată (separat: 1.250 lei)',
    ],
    versions: [
      {
        id: 'p1',
        label: 'v1',
        pill: { tone: 'done', text: 'Oferta de acum' },
        sale: '1–30 nov. 2026',
        month: { lei: '399 lei', eur: '80 €' },
        year: { lei: '3.990 lei', eur: '800 €' },
        businesses: 3,
        businessesAria: '3 afaceri pe Business Plus v1, vezi lista',
      },
    ],
    keepNote: false,
  },
  {
    id: 'clinic',
    name: 'Clinică',
    status: 'scheduled',
    statusText: 'Programat',
    subline: 'Disponibil 15 noiembrie – 15 decembrie · 0 afaceri îl au',
    apps: ['booking', 'crm', 'documents', 'hr'],
    price: {
      month: '259 lei pe lună',
      monthEur: '52 €',
      year: '2.590 lei pe an',
      yearEur: '520 €',
    },
    separate: {
      month: '316 lei pe lună',
      monthEur: '64 €',
      saving: 'Economie: 57 lei pe lună (18%)',
    },
    includes: [
      '2.000 de programări pe lună',
      '1.000 SMS pe lună',
      '20 GB spațiu pentru documente',
      '10 locuri în echipă în plus (13 cu cele din cont)',
      'Implementare: 500 lei, o singură dată (separat: 700 lei)',
    ],
    versions: [
      {
        id: 'c1',
        label: 'v1',
        pill: { tone: 'neutral', text: 'Următoarea' },
        sale: '15 nov. – 15 dec. 2026',
        month: { lei: '259 lei', eur: '52 €' },
        year: { lei: '2.590 lei', eur: '520 €' },
        businesses: 0,
        businessesAria: '',
      },
    ],
    keepNote: false,
  },
  {
    id: 'start',
    name: 'Start',
    status: 'stopped',
    statusText: 'Vânzare oprită pe 28 oct.',
    subline: '41 de afaceri îl au',
    apps: ['booking', 'crm'],
    price: {
      month: '179 lei pe lună',
      monthEur: '36 €',
      year: '1.790 lei pe an',
      yearEur: '360 €',
    },
    separate: {
      month: '218 lei pe lună',
      monthEur: '44 €',
      saving: 'Economie: 39 lei pe lună (18%)',
    },
    includes: [
      '1.000 de programări pe lună',
      '500 SMS pe lună',
      '2 locuri în echipă în plus (5 cu cele din cont)',
      'Fără cost de implementare',
    ],
    versions: [
      {
        id: 's1',
        label: 'v1',
        pill: { tone: 'neutral', text: 'Încheiată' },
        sale: '1 iun. – 28 oct. 2026',
        month: { lei: '179 lei', eur: '36 €' },
        year: { lei: '1.790 lei', eur: '360 €' },
        businesses: 41,
        businessesAria: '41 de afaceri pe Start v1, vezi lista',
      },
    ],
    keepNote: true,
  },
];

/** FounderPlans (S117) → „1 · Lista bundle-urilor” → Desktop · 1280 (H 1760). */
export function FounderBundlesFrame() {
  return (
    <div className={c.frameRel}>
      <FounderShellDemo active="planuri" title="Bundle-uri">
        <BundlesView
          phone={false}
          bundles={BUNDLES}
          onNew={noop}
          onStop={noop}
          onNewOffer={noop}
          onEditOffer={noop}
          onOpenVersion={noop}
          onBusinesses={noop}
        />
      </FounderShellDemo>
    </div>
  );
}

const ED: BundleEditorState = {
  apps: [
    { id: 'booking', checked: true, price: '149 lei pe lună' },
    { id: 'crm', checked: true, price: '69 lei pe lună' },
    { id: 'hr', checked: true, price: '69 lei pe lună' },
    { id: 'finance', checked: true, price: '79 lei pe lună' },
    { id: 'marketing', checked: true, price: '49 lei pe lună', isNew: true },
    { id: 'analytics', checked: false, price: '59 lei pe lună' },
    { id: 'documents', checked: false, price: '29 lei pe lună' },
    { id: 'shifts', checked: false, price: '39 lei pe lună' },
  ],
  separate: {
    label: '5 aplicații luate separat',
    month: '415 lei pe lună',
    rest: '4.150 lei · 84 € · 840 €',
  },
  prices: {
    monthlyLei: '329',
    annualLei: '3.290',
    monthlyEur: '66',
    annualEur: '660',
    setupLei: '600',
    setupEur: '120',
  },
  helpers: {
    monthlyLei: 'Clientul economisește 86 lei pe lună (21%) față de aplicațiile luate separat.',
    annualLei: 'Față de 12 plăți lunare, clientul economisește 658 lei.',
    monthlyEur: 'Separat: 84 € pe lună.',
    annualEur: 'Față de 12 plăți lunare, clientul economisește 132 €.',
  },
  setupDesc:
    'O singură dată, la cumpărare. Separat, aplicațiile ar avea implementare de 1.100 lei (220 €).',
  limits: [
    { key: 'a', label: 'Programări pe lună', base: '1.500', value: '2.000', dir: 'up' },
    { key: 's', label: 'SMS pe lună', base: '1.500', value: '1.500', dir: 'same' },
    { key: 'c', label: 'Campanii pe lună', base: '—', value: '10', dir: 'up' },
    { key: 'e', label: 'E-mailuri pe lună', base: '—', value: '2.000', dir: 'up' },
  ],
  baseLabel: 'v2',
  newLabel: 'v3',
  seats: '7',
  seatsHelp: 'Pe lângă cele 3 incluse în orice cont: 10 în total.',
  from: new Date(2026, 11, 1),
  until: new Date(2026, 11, 31),
  catalogNote: 'În catalog, afacerile văd „Ofertă valabilă până pe 31 decembrie”.',
  errors: {},
};

/** FounderPlanEditor (S117) → Screens → Desktop · 1280 (H 1960). */
export function FounderBundleEditorFrame() {
  return (
    <div className={c.frameRel}>
      <FounderShellDemo active="planuri" title="Business · ofertă nouă">
        <BundleEditorView
          phone={false}
          title="Business · ofertă nouă (v3)"
          crumbs={{ bundles: 'Bundle-uri', bundle: 'Business', current: 'v3 (ciornă)' }}
          notice={{
            kind: 'keep',
            title: 'Oferta de acum nu se schimbă',
            body: 'v2 rămâne în vânzare până pe 30 noiembrie. Cele 55 de afaceri care au Business își păstrează versiunea și prețul.',
          }}
          state={ED}
          today={new Date(2026, 9, 31)}
          onApps={noop}
          onPrices={noop}
          onLimit={noop}
          onSeats={noop}
          onPeriod={noop}
        />
      </FounderShellDemo>
      <BundleEditorBar
        phone={false}
        savedLabel="Ciornă salvată acum 2 min"
        scheduleLabel="Programează oferta"
        canSchedule
        onSave={noop}
        onSchedule={noop}
      />
    </div>
  );
}
