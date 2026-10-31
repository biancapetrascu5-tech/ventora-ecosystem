/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (FBizDetail) */
'use client';
// FBizDetail din preview-urile FounderSupportSession / FounderOwnerRecovery: pagina afacerii
// (FounderBusiness, în afara Lotului 2.6), fundalul formularului și al Drawer-ului.
import { Button, Tabs, type AppName } from '@ventora/ui';
import {
  BusinessUsageSection,
  BusinessView,
  ExceptionsSection,
  PlanCardContent,
  type BusinessMenuItem,
  type ExceptionRow,
} from '@ventora/screens';
import { FounderShellDemo } from './founderShell';
import { noop } from './shell';

const rows = (what: string): ExceptionRow[] => [
  {
    id: 1,
    what,
    value: '12 în loc de 10',
    until: '31 dec. 2026',
    reason: 'Extindere la al doilea cabinet',
    by: 'Bianca Petrașcu · 3 oct.',
  },
  {
    id: 2,
    what: 'Reducere la abonament',
    value: '15%',
    until: '31 mar. 2027',
    reason: 'Client din primul val',
    by: 'Bianca Petrașcu · 1 mar.',
  },
];
const APPS_ON: AppName[] = ['booking', 'crm', 'finance', 'hr'];

/* „Mai multe” din preview-urile FounderSupportSession / FounderOwnerRecovery (S95). */
export const MENU_S95: BusinessMenuItem[] = [
  { id: 'support', label: 'Deschide o sesiune de suport', icon: 'eye' },
  { id: 'recovery', label: 'Recuperează accesul proprietarului', icon: 'key-round' },
  { id: 'move', label: 'Mută pe altă versiune', icon: 'arrow-right', separatorBefore: true },
  { id: 'resend', label: 'Retrimite invitația proprietarului', icon: 'send' },
  { id: 'suspend', label: 'Suspendă afacerea', icon: 'lock', danger: true, separatorBefore: true },
];

/* Textele care diferă între FounderBusiness și FounderBusinessActions (S112, cu datele S113:
   perioada de consum, „Locuri în echipă”, „membri”). */
const COPY = {
  s95: {
    usage: 'Consum în octombrie',
    seats: 'Angajați',
    limit: 'Limită de angajați',
    plan: ' · 349 lei pe lună',
    note: 'Reducere 15% până pe 31 martie 2027 · se reînnoiește pe 1 noiembrie',
    exception: 'Excepție: 12 angajați (Bianca Petrașcu)',
  },
  s112: {
    usage: 'Consum: 17 oct. – 16 nov.',
    seats: 'Locuri în echipă',
    limit: 'Limită de membri',
    plan: ' · plătește lunar: 349 lei',
    note: 'Moneda: lei · reducere 15% până pe 31 martie 2027 · se reînnoiește pe 17 noiembrie · consumul pornește de la zero pe 17 ale fiecărei luni',
    exception: 'Excepție: 12 membri (Bianca Petrașcu)',
  },
};

/** FBizDetail: pagina afacerii din design, cu partea comercială (Lotul 3.4) pusă din galerie. */
export function FounderBusinessDemo({
  menu = MENU_S95,
  copy = 's112',
}: { menu?: BusinessMenuItem[]; copy?: keyof typeof COPY } = {}) {
  const c = COPY[copy];
  return (
    <FounderShellDemo active="afaceri" title="Clinica Dentis Sibiu">
      <BusinessView
        phone={false}
        name="Clinica Dentis Sibiu"
        status={{ tone: 'attention', label: 'Aproape de limită', icon: 'triangle-alert' }}
        meta="Business · v2 · client din martie 2025 · Andrei Mureșan (proprietar)"
        primaryAction={<Button icon="sliders-horizontal">Adaugă o excepție</Button>}
        menu={menu}
        onMenuAction={noop}
        tabs={
          <Tabs
            label="Afacere"
            defaultSelectedKey="o"
            items={[
              { id: 'o', label: 'Prezentare' },
              { id: 'c', label: 'Consum' },
              { id: 'e', label: 'Excepții', count: 2 },
              { id: 'f', label: 'Facturi' },
              { id: 'j', label: 'Jurnal' },
            ]}
          />
        }
        main={
          <>
            <BusinessUsageSection
              title={c.usage}
              items={[
                {
                  key: 'sms',
                  label: 'SMS-uri',
                  used: 920,
                  limit: 1000,
                  note: 'La ritmul de acum, ajunge la limită pe 26 octombrie.',
                },
                { key: 'appt', label: 'Programări', used: 640, limit: 1000 },
                { key: 'seats', label: c.seats, used: 8, limit: 12 },
                {
                  key: 'docs',
                  label: 'Spațiu documente',
                  used: 1.2,
                  limit: 5,
                  unit: 'GB',
                  decimal: true,
                },
              ]}
            />
            <ExceptionsSection
              phone={false}
              rows={rows(c.limit)}
              onAdd={noop}
              onExtend={noop}
              onEnd={noop}
            />
          </>
        }
        plan={
          <PlanCardContent
            title="Business · v2"
            rest={c.plan.replace(/^ · /, '')}
            note={c.note}
            apps={APPS_ON}
          />
        }
        owner={
          <>
            <p className="body">Andrei Mureșan</p>
            <p className="body-small muted">andrei@dentis.ro · autentificare în doi pași pornită</p>
          </>
        }
        recent={[
          { id: 1, date: '3 oct.', text: c.exception },
          { id: 2, date: '24 sep.', text: 'Pachet în plus: 500 SMS (Andrei Mureșan)' },
          { id: 3, date: '1 iun.', text: 'Mutată pe Business v2' },
        ]}
      />
    </FounderShellDemo>
  );
}
