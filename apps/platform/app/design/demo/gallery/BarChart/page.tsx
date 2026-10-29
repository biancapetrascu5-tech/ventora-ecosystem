/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { BarChart } from '@ventora/ui';
import { ThStack } from '../_shared/QPair';
import { Forced } from '../_shared/Forced';
import { CHART_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Frame({ th }) → Set({ L: BC.ro }); datele AX_AN_* din preview
const DAYS = [
  { label: 'Lun', value: 98, compare: 91 },
  { label: 'Mar', value: 124, compare: 117 },
  { label: 'Mie', value: 131, compare: 120 },
  { label: 'Joi', value: 146, compare: 138 },
  { label: 'Vin', value: 188, compare: 171 },
  { label: 'Sâm', value: 175, compare: 182 },
];
const MONTHS = ['mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.'];
const REV = [43900, 45200, 38700, 34900, 43100, 48250]; // AX_AN_REV.slice(6)
const SERV = [
  { label: 'Vopsit', value: 16420, share: '34%' },
  { label: 'Tuns și coafat', value: 12880, share: '27%' },
  { label: 'Manichiură', value: 8650, share: '18%' },
  { label: 'Tratamente faciale', value: 6120, share: '13%' },
  { label: 'Pedichiură', value: 4180, share: '8%' },
];
const L = {
  lbl: [
    'Implicit',
    'Hover pe vineri (tooltip)',
    '„Vezi ca tabel”',
    'Coloană îngustă (360px): eticheta lungă se taie',
  ],
  t1: 'Programări pe zi a săptămânii',
  d1: 'Media pe ultimele 4 săptămâni',
  cmp: 'Cu un an înainte',
  t2: 'Venituri pe lună',
  d2: 'Octombrie e încă în curs',
  now: 'în curs',
  t3: 'Venituri pe serviciu',
  d3: 'Octombrie, până azi',
};
const months = MONTHS.map((l, i) => ({ label: l, value: REV[i]!, now: i === 5, nowLabel: L.now }));

function Lab({ children }: { children: React.ReactNode }) {
  return (
    <p className={`caption ${f.muted}`} style={{ marginTop: 'var(--space-2)' }}>
      {children}
    </p>
  );
}

function Set() {
  const c = { chartLabels: CHART_RO, locale: 'ro' };
  return (
    <>
      <div className={f.axcharts}>
        <Forced>
          <Lab>{L.lbl[0]}</Lab>
          <BarChart title={L.t1} description={L.d1} data={DAYS} compareLabel={L.cmp} {...c} />
        </Forced>
        <Forced hover={4}>
          <Lab>{L.lbl[1]}</Lab>
          <BarChart title={L.t1} description={L.d1} data={DAYS} compareLabel={L.cmp} {...c} />
        </Forced>
        <Forced hover={5}>
          <Lab>Hover pe octombrie (tooltip)</Lab>
          <BarChart title={L.t2} description={L.d2} data={months} unit="lei" {...c} />
        </Forced>
        <Forced table>
          <Lab>{L.lbl[2]}</Lab>
          <BarChart title={L.t2} description={L.d2} data={months} unit="lei" {...c} />
        </Forced>
      </div>
      <div className={f.axcharts}>
        <Forced hover={1}>
          <BarChart
            orientation="horizontal"
            title={L.t3}
            description={L.d3}
            data={SERV}
            unit="lei"
            {...c}
          />
        </Forced>
        <div style={{ maxWidth: 360 }}>
          <Lab>{L.lbl[3]}</Lab>
          <BarChart
            orientation="horizontal"
            title={L.t3}
            description={L.d3}
            data={SERV}
            unit="lei"
            {...c}
          />
        </div>
      </div>
    </>
  );
}

export default function BarChartGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThStack bare titleClass="caption" render={() => <Set />} />;
}
