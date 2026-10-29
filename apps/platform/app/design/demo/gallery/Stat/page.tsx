/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Stat, StatGroup } from '@ventora/ui';
import { QPair } from '../_shared/QPair';

// preview.html → Q_Extra → „Light / Dark” → Q_Pair(Q_Stats(Q_RO))
const RO = {
  rev: 'Venituri',
  cli: 'Clienți noi',
  per: 'față de oct. 2025',
  over: 'Facturi restante',
  overH: '4 facturi, cea mai veche de 14 zile',
  work: 'La lucru acum',
  of6: 'din 6',
  workH: 'Sorin începe la 11:00',
};

function Stats() {
  return (
    <StatGroup>
      <Stat
        label={RO.rev}
        value="48.250 lei"
        icon="banknote"
        delta={{ value: '+12%', period: RO.per }}
      />
      <Stat label={RO.cli} value="64" delta={{ value: '−8%', period: RO.per }} />
      <Stat label={RO.over} value="4.310 lei" tone="attention" hint={RO.overH} onClick={() => {}} />
      <Stat label={RO.work} value="4" unit={RO.of6} hint={RO.workH} />
    </StatGroup>
  );
}

export default function StatGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <QPair offsetY={{ desktop: 0.75, phone: 0.0625 }}>
      <Stats />
    </QPair>
  );
}
