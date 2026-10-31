/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (S117) */
'use client';

import { AppShell } from '@ventora/ui';
import {
  CatalogBundlesView,
  type CatalogAppCard,
  type CatalogBundleCard,
} from '@/screens/catalog/CatalogBundlesView';
import { HubBarLeading } from '../_shared/hubLauncher';
import { Bar, noop } from '../_shared/shell';
import c from '../_shared/founderCommercial.module.css';

// HubCatalogBundles → „1 · Bundle-urile de acum, pentru Salon Aurora (are Business v1 +
// CampaignKit)” → Desktop · 1280 (H 1200). Vederea e cea din aplicația Hub (/catalog).
const BUNDLES: CatalogBundleCard[] = [
  {
    id: 'business',
    title: 'Bundle Business',
    appsCount: '4 aplicații',
    validUntil: 'Ofertă valabilă până pe 30 noiembrie',
    apps: ['booking', 'crm', 'hr', 'finance'],
    price: '319 lei pe lună',
    priceYear: 'sau 3.190 lei pe an',
    separate: 'Separat: 366 lei pe lună',
    saving: 'Economisești 47 lei pe lună',
    limits: ['1.500 de programări pe lună', '1.500 SMS pe lună'],
    seats: { count: '10 locuri în echipă', breakdown: '3 incluse în orice cont + 7 din bundle' },
    setup: 'Implementare: 600 lei, o singură dată',
    have: 'Îl păstrezi la prețul tău: 300 lei pe lună.',
    canRequest: false,
  },
  {
    id: 'plus',
    title: 'Bundle Business Plus',
    appsCount: '7 aplicații',
    validUntil: 'Ofertă valabilă până pe 30 noiembrie',
    apps: ['booking', 'crm', 'hr', 'finance', 'marketing', 'shifts', 'documents'],
    price: '399 lei pe lună',
    priceYear: 'sau 3.990 lei pe an',
    separate: 'Separat: 483 lei pe lună',
    saving: 'Economisești 84 lei pe lună',
    limits: ['3.000 de programări pe lună', '3.000 SMS pe lună', '20 GB spațiu pentru documente'],
    seats: {
      count: '20 de locuri în echipă',
      breakdown: '3 incluse în orice cont + 17 din bundle',
    },
    setup: 'Implementare: 800 lei, o singură dată',
    notes: [
      'Include și CampaignKit, pe care acum o plătești la bucată.',
      'Abonamentul tău ar fi 399 lei pe lună, în loc de 349 lei.',
    ],
    canRequest: true,
  },
];

const APPS: CatalogAppCard[] = [
  {
    id: 'documents',
    maintenance: 'Mentenanță: 29 lei pe lună',
    setup: 'Fără cost de implementare',
    limits: '5 GB spațiu pentru documente',
  },
  {
    id: 'shifts',
    maintenance: 'Mentenanță: 39 lei pe lună',
    setup: 'Implementare: 150 lei, o singură dată',
  },
  {
    id: 'analytics',
    maintenance: 'Mentenanță: 59 lei pe lună',
    setup: 'Fără cost de implementare',
  },
];

export function HubCatalogBundlesFrame() {
  return (
    <div className={c.xFrame}>
      <AppShell
        height="100%"
        contextBar={<Bar title="Bundle-uri" hub leading={<HubBarLeading />} />}
      >
        <CatalogBundlesView bundles={BUNDLES} apps={APPS} phone={false} onRequest={noop} />
      </AppShell>
    </div>
  );
}
