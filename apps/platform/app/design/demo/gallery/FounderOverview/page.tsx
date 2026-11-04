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
// ?state=ok | first | error → cadrele 2–4; ?w=390 → cadrul Telefon (H 2500). Fără rândurile care n-au încă sursă în Founder
// (suportul, plata eșuată, disputa) și fără cifrele „Venit lunar recurent” / „Plăți eșuate”
// (NECESITĂ DECIZIE în raportul 04.11).
const DATA: OverviewViewData = {
  stats: { active: 52, newThisMonth: 4, month: 'noiembrie', trial: 7, trialEnding: 2 },
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
};
const OK: OverviewViewData = {
  ...DATA,
  requests: { n: 0, meta: '' },
  exceptions: [],
  limits: DATA.limits.slice(0, 1),
};
const H = { ready: 1450, ok: 1300, first: 700, error: 700 };
const M = { ready: 2500, ok: 2200, first: 900, error: 900 };

export default function FounderOverviewGallery({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; w?: string }>;
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
              data={key === 'ok' ? OK : DATA}
              onOpenRequests={noop}
              onExtend={noop}
              onOpenUsage={noop}
              onOpenBusiness={noop}
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
