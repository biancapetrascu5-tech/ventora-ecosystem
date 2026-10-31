/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html (FX_BIZ) */
'use client';

import {
  APPS,
  AppIcon,
  Select,
  Stat,
  StatGroup,
  type AppName,
  type DataTableColumn,
} from '@ventora/ui';
import { BusinessesView, type BusinessListRow } from '@ventora/screens';
import { FounderShellDemo } from '../_shared/founderShell';
import { noop } from '../_shared/shell';
import d from './businesses-demo.module.css';

// FBiz din preview: partea comercială (cifrele de sus, abonamentul, aplicațiile, consumul,
// filtrele) e din design și intră în aplicație în Lotul 3.4; restul e BusinessesView, ca în Founder.
type Row = BusinessListRow & { plan: string; apps: AppName[]; usage: [string, number] };

const RANK = { danger: 0, attention: 1, neutral: 2, done: 3 } as const;

const DATA: Row[] = [
  {
    id: 1,
    name: 'Clinica Dentis Sibiu',
    sub: 'Sibiu · Andrei Mureșan',
    plan: 'Business · v2',
    apps: ['booking', 'crm', 'finance', 'hr'],
    usage: ['SMS', 92],
    status: { tone: 'attention', label: 'Aproape de limită', icon: 'triangle-alert' },
    since: 'mar. 2025',
  },
  {
    id: 2,
    name: 'Salon Aurora',
    sub: 'Sibiu · Ioana Pavel',
    plan: 'Business · v2',
    apps: ['booking', 'crm', 'hr', 'finance', 'projects', 'shifts', 'documents'],
    usage: ['Angajați', 100],
    status: { tone: 'attention', label: 'La limită', icon: 'triangle-alert' },
    since: 'ian. 2025',
  },
  {
    id: 3,
    name: 'Agenția Nord Studio',
    sub: 'Cluj-Napoca · Mihai Rusu',
    plan: 'Start · v2',
    apps: ['projects', 'crm'],
    usage: ['Proiecte', 40],
    status: { tone: 'neutral', label: 'Probă până pe 2 nov.', icon: 'clock' },
    since: 'oct. 2026',
  },
  {
    id: 4,
    name: 'Fitness Atlas',
    sub: 'Brașov · Elena Dragomir',
    plan: 'Business Plus · v1',
    apps: ['booking', 'shifts', 'finance', 'marketing', 'analytics'],
    usage: ['SMS', 61],
    status: { tone: 'danger', label: 'Plată eșuată', icon: 'circle-x' },
    since: 'iun. 2025',
  },
  {
    id: 5,
    name: 'Cabinet Avocatura Pop',
    sub: 'Sibiu · Radu Pop',
    plan: 'Start · v1',
    apps: ['contracts', 'documents', 'finance'],
    usage: ['Documente', 33],
    status: { tone: 'done', label: 'Activă', icon: 'check' },
    since: 'feb. 2026',
  },
  {
    id: 6,
    name: 'Pensiunea Valea Verde',
    sub: 'Rășinari · Ana Stoica',
    plan: 'Business · v1',
    apps: ['booking', 'events', 'finance'],
    usage: ['Programări', 48],
    status: { tone: 'done', label: 'Activă', icon: 'check' },
    since: 'aug. 2025',
  },
];

const ROWS = [...DATA].sort(
  (a, b) => RANK[a.status.tone] - RANK[b.status.tone] || a.name.localeCompare(b.name, 'ro'),
);

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'plan', header: 'Abonament', secondary: true },
  {
    key: 'apps',
    header: 'Aplicații',
    optional: true,
    render: (r) => (
      <span className={d.apps}>
        {r.apps.slice(0, 4).map((a) => (
          <AppIcon key={a} app={a} size={20} title={APPS[a]?.name} />
        ))}
        {r.apps.length > 4 && <span className="caption muted">+{r.apps.length - 4}</span>}
      </span>
    ),
  },
  {
    key: 'usage',
    header: 'Consum maxim',
    optional: true,
    render: (r) => (
      <span className="v-num body-small">
        {r.usage[0]} · {r.usage[1]}%
      </span>
    ),
  },
];

export function FounderBusinessesFrame() {
  return (
    <FounderShellDemo active="afaceri" title="Afaceri">
      <BusinessesView
        phone={false}
        rows={ROWS}
        columns={COLUMNS}
        stats={
          <StatGroup>
            <Stat
              label="Afaceri active"
              value="128"
              delta={{ value: '+7', period: 'în octombrie' }}
            />
            <Stat
              label="Venit lunar recurent"
              value="41.920 lei"
              delta={{ value: '+6%', period: 'față de septembrie' }}
            />
            <Stat label="În perioadă de probă" value="14" hint="5 se încheie săptămâna aceasta" />
            <Stat
              label="Plăți eșuate"
              value="3"
              tone="attention"
              hint="1.047 lei de recuperat"
              onClick={noop}
            />
          </StatGroup>
        }
        filters={
          <>
            <div className={d.plans}>
              <Select
                size="sm"
                defaultValue="all"
                aria-label="Abonament"
                options={[
                  { value: 'all', label: 'Toate abonamentele' },
                  { value: 's', label: 'Start' },
                  { value: 'b', label: 'Business' },
                  { value: 'p', label: 'Business Plus' },
                ]}
              />
            </div>
            <div className={d.states}>
              <Select
                size="sm"
                defaultValue="all"
                aria-label="Stare"
                options={[
                  { value: 'all', label: 'Toate stările' },
                  { value: 'att', label: 'Cer atenție' },
                  { value: 'trial', label: 'În probă' },
                ]}
              />
            </div>
          </>
        }
        search=""
        onSearchChange={noop}
        onNew={noop}
        onOpen={noop}
        rowActions={() => [
          { label: 'Deschide afacerea', icon: 'external-link' },
          { label: 'Adaugă o excepție', icon: 'sliders-horizontal' },
          { label: 'Retrimite invitația proprietarului', icon: 'send' },
        ]}
        pagination={{ page: 1, pageSize: 20, total: 128, onPageChange: noop }}
      />
    </FounderShellDemo>
  );
}
