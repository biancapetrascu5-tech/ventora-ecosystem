/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (S121) */
'use client';

import type { ReactNode } from 'react';
import { PageHeader, Tabs } from '@ventora/ui';
import {
  BillingProfileCard,
  BusinessView,
  InvoiceHistorySection,
  InvoiceNotIssuedNotice,
  SetupRequestsList,
  type InvoiceHistoryRow,
  type SetupRow,
} from '@ventora/screens';
import { FounderShellDemo } from './founderShell';
import { noop } from './shell';
import c from './founderCommercial.module.css';

/* Lotul 3.8 (S121): primul cadru din FounderBillingProfile, FounderInvoiceNotIssued și
   FounderSetupRequests, cu vederile din @ventora/screens și exemplele din preview.html. */

const TABS = [
  { id: 'o', label: 'Prezentare' },
  { id: 'c', label: 'Consum' },
  { id: 'e', label: 'Excepții' },
  { id: 'f', label: 'Plăți și facturi' },
  { id: 'j', label: 'Jurnal' },
];

const PROFILE = {
  type: 'company' as const,
  name: 'Salon Aurora SRL',
  taxId: '41829376',
  regCom: 'J32/1187/2019',
  street: 'Str. Nicolae Bălcescu 12',
  city: 'Sibiu',
  county: 'Sibiu',
  country: 'RO',
  email: 'facturi@salonaurora.ro',
};

const PAID: InvoiceHistoryRow[] = [
  {
    id: 1,
    date: '1 nov.',
    what: 'Abonament Business · noiembrie',
    amount: '449 lei',
    inv: 'VS 2026-0418',
    st: 'paid',
  },
  {
    id: 2,
    date: '14 oct.',
    what: 'Pachet 500 SMS',
    amount: '49 lei',
    inv: 'VS 2026-0377',
    st: 'paid',
  },
  {
    id: 3,
    date: '1 oct.',
    what: 'Abonament Business · octombrie',
    amount: '449 lei',
    inv: 'VS 2026-0301',
    st: 'paid',
  },
];

function BizFrame({ children, phone }: { children: ReactNode; phone?: boolean }) {
  return (
    <div className={c.xFrame}>
      <FounderShellDemo active="afaceri" title="Afaceri">
        <BusinessView
          phone={!!phone}
          name="Salon Aurora"
          meta="Business · v2 · 12 membri · din ianuarie 2025"
          menu={[]}
          onMenuAction={noop}
          owner={null}
          recent={[]}
          tabs={<Tabs label="Afacerea" defaultSelectedKey="f" items={TABS} />}
          full={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {children}
            </div>
          }
        />
      </FounderShellDemo>
    </div>
  );
}

export function FounderBillingProfileFrame({ phone }: { phone?: boolean }) {
  return (
    <BizFrame phone={phone}>
      <BillingProfileCard profile={PROFILE} onEdit={noop} phone={phone} />
      <InvoiceHistorySection rows={PAID} onRetry={noop} onManual={noop} />
    </BizFrame>
  );
}

export function FounderInvoiceNotIssuedFrame({ phone }: { phone?: boolean }) {
  const rows: InvoiceHistoryRow[] = [
    {
      id: 1,
      date: '4 nov.',
      what: 'Implementare CampaignKit',
      amount: '600 lei',
      inv: '—',
      st: 'notIssued',
    },
    PAID[0]!,
    PAID[1]!,
  ];
  return (
    <BizFrame phone={phone}>
      <InvoiceNotIssuedNotice
        what="Implementare CampaignKit"
        amount="600 lei"
        date="4 noiembrie"
        reason="CUI-ul cumpărătorului nu e valid."
        onRetry={noop}
        onManual={noop}
        onEditProfile={noop}
      />
      <InvoiceHistorySection rows={rows} activeRow={1} onRetry={noop} onManual={noop} />
    </BizFrame>
  );
}

const SETUP: SetupRow[] = [
  {
    id: 1,
    business: 'Salon Aurora',
    item: 'CampaignKit',
    who: 'Bianca Petrașcu',
    when: 'azi, 10:12',
    st: 'requested',
  },
  {
    id: 2,
    business: 'Clinica Dentis Sibiu',
    item: 'Domeniu propriu pentru pagina de rezervări',
    who: 'Andrei Mureșan',
    when: 'ieri',
    st: 'accepted',
  },
  {
    id: 3,
    business: 'Fitness Atlas',
    item: 'ShiftPlan',
    who: 'Elena Dragomir',
    when: '1 nov.',
    st: 'confirmed',
  },
  {
    id: 4,
    business: 'Studio Lumina',
    item: 'EasyBook · import clienți',
    who: 'Maria Constantin',
    when: '30 oct.',
    st: 'paid',
  },
  {
    id: 5,
    business: 'Agenția Nord Studio',
    item: 'TaskBoard',
    who: 'Mihai Rusu',
    when: '27 oct.',
    st: 'inProgress',
  },
  {
    id: 6,
    business: 'Cabinet Avocatura Pop',
    item: 'ContractDesk',
    who: 'Radu Pop',
    when: '20 oct.',
    st: 'live',
  },
  {
    id: 7,
    business: 'Pensiunea Valea Verde',
    item: 'EventSpace',
    who: 'Ana Stoica',
    when: '18 oct.',
    st: 'cancelled',
  },
  {
    id: 8,
    business: 'Hotel Continental',
    item: 'DataView',
    who: 'Victor Lazăr',
    when: '12 oct.',
    st: 'refunded',
  },
];

export function FounderSetupRequestsFrame({ phone }: { phone?: boolean }) {
  return (
    <div className={c.ssFrame}>
      <div className={c.ssBody}>
        <FounderShellDemo active="cereri" title="Cereri">
          <PageHeader
            title="Cereri din Hub"
            description={
              phone
                ? undefined
                : 'Ce au cerut afacerile din Hub: activarea unui pachet sau a unei aplicații, ori alt abonament.'
            }
          />
          <div style={{ padding: phone ? '0 var(--space-4)' : '0 var(--space-8)' }}>
            <SetupRequestsList rows={SETUP} onOpen={noop} onOpenBusiness={noop} />
          </div>
        </FounderShellDemo>
      </div>
    </div>
  );
}
