/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (S118) */
'use client';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { OverviewView, type OverviewState, type OverviewViewData } from '@ventora/screens';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderShellDemo } from '../_shared/founderShell';
import { noop } from '../_shared/shell';
import c from '../_shared/founderCommercial.module.css';

// preview.html (S118) → Board „Founder — Prezentare” → 1 · Zi obișnuită (Desktop · 1280, H 1450);
// ?state=ok | first | error → cadrele 2–4; ?w=390 → cadrul Telefon (H 2500). Venitul lunar
// recurent fără schimbarea față de luna trecută (decizia 04.11.2026). Lotul 3.6: cardul „Plăți
// eșuate” (2 · 898 lei de încasat), plata eșuată (Fitness Atlas) și disputa (Agenția Nord Studio);
// fără rândul de suport (Lotul 4.6). ?invoice=1: și rândul „Factura nu s-a emis” (D-3.6-4, fără
// design încă).
const DATA: OverviewViewData = {
  stats: {
    active: 52,
    newThisMonth: 4,
    month: 'noiembrie',
    mrr: { RON: 1_894_000, EUR: 0 },
    trial: 7,
    trialEnding: 2,
  },
  requests: { n: 2, meta: 'Salon Aurora · Business Plus; Clinica Dentis Sibiu · domeniu propriu' },
  exceptions: [
    {
      id: 'exc',
      date: '8 noiembrie',
      business: 'Salon Aurora',
      what: '12 membri în loc de 10',
      who: 'Bianca Petrașcu',
      when: 'peste 4 zile',
    },
    {
      id: 'exc2',
      date: '10 noiembrie',
      business: 'Clinica Dentis Sibiu',
      what: '1.500 de programări în loc de 1.000',
      who: 'Mihai Ionescu',
      when: 'peste 6 zile',
    },
  ],
  limits: [
    { id: '1', business: 'Clinica Dentis Sibiu', limit: 'Programări', used: 948, max: 1000 },
    { id: '2', business: 'Salon Aurora', limit: 'Mesaje automate', used: 1640, max: 2000 },
    { id: '3', business: 'Fitness Atlas', limit: 'Locuri în echipă', used: 9, max: 10 },
    { id: '4', business: 'Agenția Nord Studio', limit: 'SMS', used: 420, max: 500 },
  ],
  recent: [
    {
      id: '1',
      name: 'Studio Lumen',
      what: 'Esențial · EasyBook, ClientDesk',
      created: 'azi, 09:12',
      status: 'invited',
    },
    {
      id: '2',
      name: 'Cabinet Avocatura Pop',
      what: 'ContractDesk, DocSpace',
      created: 'ieri',
      status: 'trial',
    },
    { id: '3', name: 'Fitness Atlas', what: 'Business', created: '28 oct.', status: 'active' },
    {
      id: '4',
      name: 'Clinica Dentis Sibiu',
      what: 'Business Plus',
      created: '21 oct.',
      status: 'active',
    },
  ],
  failedPayments: [
    {
      id: 'pay',
      organizationId: '3',
      business: 'Fitness Atlas',
      amountMinor: 44_900,
      currency: 'RON',
      next: 'mâine, 09:00',
      when: 'ieri',
    },
    {
      id: 'pay2',
      organizationId: '5',
      business: 'Studio Pilates Arc',
      amountMinor: 44_900,
      currency: 'RON',
      next: '7 noiembrie, 09:00',
      when: 'acum 2 zile',
    },
  ],
  disputes: [
    {
      id: 'dis',
      business: 'Agenția Nord Studio',
      amountMinor: 129_000,
      currency: 'RON',
      due: '12 noiembrie',
      url: 'https://dashboard.stripe.com/test/disputes/dp_demo',
    },
  ],
  invoices: [],
};
const INVOICE: OverviewViewData['invoices'] = [
  {
    id: 'inv',
    organizationId: '2',
    business: 'Salon Aurora',
    amountMinor: 4_900,
    currency: 'RON',
    status: 'pending',
    attempts: 3,
  },
];
const OK: OverviewViewData = {
  ...DATA,
  requests: { n: 0, meta: '' },
  exceptions: [],
  limits: DATA.limits.slice(0, 1),
  failedPayments: [],
  disputes: [],
  invoices: [],
};
const H = { ready: 1450, ok: 1300, first: 700, error: 700 };
const M = { ready: 2500, ok: 2200, first: 900, error: 900 };

export default function FounderOverviewGallery({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; w?: string; invoice?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = use(searchParams);
  const p = sp.state;
  const phone = sp.w === '390';
  const key = p === 'ok' || p === 'first' || p === 'error' ? p : 'ready';
  const state: OverviewState = key === 'ok' ? 'ready' : key;
  return (
    <DesktopFrames
      founder
      title="Founder — Prezentare (prima pagină după intrare)"
      height={phone ? M[key] : H[key]}
      width={phone ? 390 : undefined}
      render={() => (
        <div className={c.frameRel}>
          <FounderShellDemo active="azi" title="Prezentare">
            <OverviewView
              state={state}
              greeting="Bună dimineața, Bianca"
              lead="Miercuri, 4 noiembrie. Ce s-a schimbat de ieri și ce te așteaptă."
              updated="Actualizat la 09:41"
              data={key === 'ok' ? OK : sp.invoice === '1' ? { ...DATA, invoices: INVOICE } : DATA}
              onOpenRequests={noop}
              onExtend={noop}
              onOpenUsage={noop}
              onOpenBusiness={noop}
              onOpenStripe={noop}
              onAllBusinesses={noop}
              onNewBusiness={noop}
              onRetry={noop}
            />
          </FounderShellDemo>
        </div>
      )}
    />
  );
}
