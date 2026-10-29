/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Agenda, type AgendaItem } from '@ventora/ui';
import { ThPair } from '../_shared/QPair';
import { EVENT_STATUS_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Demo → thgrid → Frame({ th: "light" }) → Set({ L: AG.ro })
const LBL = [
  'Toate stările · „acum” la 11:20, rândul selectat e Cristina Dobre',
  'Fără coloana de angajat (showStaff: false)',
];
const ITEMS: AgendaItem[] = [
  {
    id: 'a1',
    start: '09:00',
    end: '09:45',
    title: 'Ana Popescu',
    subtitle: 'Tuns',
    staff: 'Ioana',
    status: 'done',
  },
  {
    id: 'a2',
    start: '09:45',
    end: '10:15',
    title: 'Ștefan Țăranu',
    subtitle: 'Tuns bărbați',
    staff: 'Radu',
    status: 'noshow',
  },
  {
    id: 'a3',
    start: '10:00',
    end: '10:30',
    title: 'Vlad Cristea',
    subtitle: 'Tuns bărbați',
    staff: 'Radu',
    status: 'cancelled',
  },
  {
    id: 'a4',
    start: '11:00',
    end: '12:00',
    title: 'Andrei Ionescu',
    subtitle: 'Vopsit rădăcini',
    staff: 'Ioana',
    status: 'confirmed',
  },
  {
    id: 'a5',
    start: '12:30',
    end: '13:15',
    title: 'Cristina Dobre',
    subtitle: 'Tratament facial',
    staff: 'Ioana',
    status: 'unconfirmed',
  },
  {
    id: 'a6',
    start: '13:15',
    end: '14:00',
    title: 'Pauză de prânz',
    staff: 'Mara',
    status: 'blocked',
  },
  {
    id: 'a7',
    start: '14:30',
    end: '15:15',
    title: 'Alina Murariu',
    subtitle: 'Manichiură semipermanentă',
    staff: 'Mara',
    status: 'confirmed',
  },
];
// S.now (ro)
const NOW = 'Acum';

function Set() {
  return (
    <>
      <p className={`caption ${f.lab}`}>{LBL[0]}</p>
      <div className={f.frame}>
        <Agenda
          items={ITEMS}
          now="11:20"
          activeId="a5"
          onSelect={() => {}}
          statusLabels={EVENT_STATUS_RO}
          nowLabel={NOW}
        />
      </div>
      <p className={`caption ${f.lab}`}>{LBL[1]}</p>
      <div className={f.frame}>
        <Agenda
          items={ITEMS.slice(3, 6)}
          now="11:20"
          showStaff={false}
          statusLabels={EVENT_STATUS_RO}
          nowLabel={NOW}
        />
      </div>
    </>
  );
}

export default function AgendaGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair render={() => <Set />} />;
}
