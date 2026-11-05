/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (S121) */
'use client';

import { PageHeader, Sheet, SheetSection, UsageMeter } from '@ventora/ui';
import { HubBillingProfileCard, HubSetupRequestCard } from '@/screens/plan/HubLifecycle';
import { HubSettings } from './hubSettings';
import { noop } from './shell';
import d from '../HubAdminTeam/team-demo.module.css';

/* Lotul 3.8 (S121): primul cadru din HubBillingProfile (persoană juridică) și HubSetupRequest
   (cerută), în română, cu exemplele din preview.html. */

function Plan() {
  return (
    <Sheet>
      <SheetSection title="Abonament">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p className="body">
            <span className="body-strong">Business · v2</span> · 449 lei
          </p>
          <UsageMeter label="Locuri în echipă" used={12} limit={13} />
        </div>
      </SheetSection>
    </Sheet>
  );
}

function Page({ children, phone }: { children: React.ReactNode; phone?: boolean }) {
  return (
    <div className={d.frame}>
      <HubSettings active="abonament" title="Abonament și consum">
        <PageHeader title="Abonament și consum" />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            padding: phone ? '0 var(--space-4)' : undefined,
          }}
        >
          {children}
        </div>
      </HubSettings>
    </div>
  );
}

export function HubBillingProfileFrame({ phone }: { phone?: boolean }) {
  return (
    <Page phone={phone}>
      <Plan />
      <HubBillingProfileCard
        profile={{
          type: 'company',
          name: 'Salon Aurora SRL',
          taxId: '41829376',
          regCom: 'J32/1187/2019',
          address: 'Str. Nicolae Bălcescu 12, Sibiu, jud. Sibiu, România',
          email: 'facturi@salonaurora.ro',
        }}
        onChange={noop}
      />
    </Page>
  );
}

export function HubSetupRequestFrame({ phone }: { phone?: boolean }) {
  return (
    <Page phone={phone}>
      <HubSetupRequestCard
        app="marketing"
        state="requested"
        body="Am primit cererea pe 3 noiembrie. Îți trimitem oferta în cel mult 2 zile lucrătoare."
      />
    </Page>
  );
}
