/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (FBizDetail) */
'use client';
// FBizDetail din preview-urile FounderSupportSession / FounderOwnerRecovery: pagina afacerii
// (FounderBusiness, în afara Lotului 2.6), fundalul formularului și al Drawer-ului.
import {
  APPS,
  AppIcon,
  Button,
  DataTable,
  IconButton,
  Menu,
  PageHeader,
  Sheet,
  SheetSection,
  StatusPill,
  Tabs,
  UsageMeter,
  type AppName,
  type DataTableColumn,
} from '@ventora/ui';
import { FounderShellDemo } from './founderShell';
import { DATATABLE_RO, USAGE_RO } from './labels';
import b from './founderBusiness.module.css';

type Row = { id: number; what: string; val: string; until: string; why: string; by: string };
const COLS: DataTableColumn<Row>[] = [
  { key: 'what', header: 'Ce', primary: true },
  { key: 'val', header: 'Valoare', secondary: true },
  { key: 'until', header: 'Până la', secondary: true },
  { key: 'why', header: 'Motiv', optional: true, muted: true },
  { key: 'by', header: 'Adăugată de', optional: true, muted: true },
];
const ROWS: Row[] = [
  {
    id: 1,
    what: 'Limită de angajați',
    val: '12 în loc de 10',
    until: '31 dec. 2026',
    why: 'Extindere la al doilea cabinet',
    by: 'Bianca Petrașcu · 3 oct.',
  },
  {
    id: 2,
    what: 'Reducere la abonament',
    val: '15%',
    until: '31 mar. 2027',
    why: 'Client din primul val',
    by: 'Bianca Petrașcu · 1 mar.',
  },
];
const APPS_ON: AppName[] = ['booking', 'crm', 'finance', 'hr'];

export function FounderBusinessDemo() {
  return (
    <FounderShellDemo active="afaceri" title="Clinica Dentis Sibiu">
      <PageHeader
        title="Clinica Dentis Sibiu"
        breadcrumbs={[{ label: 'Afaceri', href: '#' }, { label: 'Clinica Dentis Sibiu' }]}
        meta={
          <span className={b.meta}>
            <StatusPill tone="attention" icon="triangle-alert">
              Aproape de limită
            </StatusPill>
            <span className="body-small muted">
              Business · v2 · client din martie 2025 · Andrei Mureșan (proprietar)
            </span>
          </span>
        }
        actions={
          <>
            <Button icon="sliders-horizontal">Adaugă o excepție</Button>
            <Menu
              label="Mai multe"
              items={[
                { id: 'support', label: 'Deschide o sesiune de suport', icon: 'eye' },
                { id: 'recovery', label: 'Recuperează accesul proprietarului', icon: 'key-round' },
                { separator: true },
                { id: 'move', label: 'Mută pe altă versiune', icon: 'arrow-right' },
                { id: 'resend', label: 'Retrimite invitația proprietarului', icon: 'send' },
                { separator: true },
                { id: 'suspend', label: 'Suspendă afacerea', icon: 'lock', isDanger: true },
              ]}
            >
              <IconButton icon="ellipsis-vertical" label="Mai multe acțiuni" variant="secondary" />
            </Menu>
          </>
        }
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
      />
      <div className={b.axb}>
        <div className={b.split}>
          <div className={b.main}>
            <Sheet>
              <SheetSection
                title="Consum în octombrie"
                description="Limitele includ excepțiile active."
              >
                <div className={b.usage}>
                  <div className={b.stack}>
                    <UsageMeter {...USAGE_RO} label="SMS-uri" used={920} limit={1000} />
                    <p className="body-small muted">
                      La ritmul de acum, ajunge la limită pe 26 octombrie.
                    </p>
                  </div>
                  <UsageMeter {...USAGE_RO} label="Programări" used={640} limit={1000} />
                  <UsageMeter {...USAGE_RO} label="Angajați" used={8} limit={12} />
                  <UsageMeter
                    {...USAGE_RO}
                    label="Spațiu documente"
                    used={1.2}
                    limit={5}
                    unit="GB"
                    format={(n) => n.toLocaleString('ro-RO')}
                  />
                </div>
              </SheetSection>
            </Sheet>
            <div>
              <div className={b.sechead}>
                <h2 className="heading">Excepții</h2>
              </div>
              <DataTable
                caption="Excepții"
                columns={COLS}
                rows={ROWS}
                rowActions={() => [
                  { label: 'Editează', icon: 'pencil' },
                  { separator: true },
                  { label: 'Încheie excepția acum', icon: 'x', destructive: true },
                ]}
                labels={DATATABLE_RO}
                locale="ro"
              />
            </div>
          </div>
          <aside className={b.side}>
            <div className={b.card}>
              <p className="subheading">Abonament</p>
              <p className="body">
                <span className="body-strong">Business · v2</span> · 349 lei pe lună
              </p>
              <p className="body-small muted">
                Reducere 15% până pe 31 martie 2027 · se reînnoiește pe 1 noiembrie
              </p>
              <div className={b.apps}>
                {APPS_ON.map((a) => (
                  <AppIcon key={a} app={a} size={24} title={APPS[a]?.name} />
                ))}
              </div>
            </div>
            <div className={b.card}>
              <p className="subheading">Proprietar</p>
              <p className="body">Andrei Mureșan</p>
              <p className="body-small muted">
                andrei@dentis.ro · autentificare în doi pași pornită
              </p>
            </div>
            <div className={b.card}>
              <p className="subheading">Ultimele modificări</p>
              <ul className={`body-small ${b.hist}`}>
                <li>
                  <span className="muted">3 oct.</span> Excepție: 12 angajați (Bianca Petrașcu)
                </li>
                <li>
                  <span className="muted">24 sep.</span> Pachet în plus: 500 SMS (Andrei Mureșan)
                </li>
                <li>
                  <span className="muted">1 iun.</span> Mutată pe Business v2
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </FounderShellDemo>
  );
}
