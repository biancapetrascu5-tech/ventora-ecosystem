/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, type ForcedState, type IconName } from '@ventora/ui';
import { Row, ThStack } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Frame({ th: "light" }) → Set({ L: T.ro })
const RO = {
  st: ['Implicit', 'Hover', 'Focus', 'Apăsat'],
  dis: 'Dezactivat',
  load: 'Se salvează',
  lbl: {
    primary: 'Confirmă',
    secondary: 'Trimite reamintire',
    quiet: 'Trimite reamintire',
    danger: 'Șterge programarea',
  },
  sizes: ['Mărimi', 'Mic', 'Mediu', 'Mare (tactil)'],
  more: ['Iconuri și link', 'Programează', 'Deschide în Portal', 'Vezi factura'],
  blk: [
    'Lățime întreagă și text lung',
    'Salvează programarea',
    'Trimite link de plată către Ștefan Țăranu',
  ],
};
const VARIANTS = ['primary', 'secondary', 'quiet', 'danger'] as const;
const ICON: Record<(typeof VARIANTS)[number], IconName> = {
  primary: 'check',
  secondary: 'send',
  quiet: 'send',
  danger: 'trash-2',
};
const STATES: (ForcedState | undefined)[] = [undefined, 'hover', 'focus', 'pressed'];

function Set() {
  const L = RO;
  return (
    <>
      {VARIANTS.map((v) => (
        <Row key={v} label={v}>
          {STATES.map((s, i) => (
            <Button key={i} variant={v} state={s} icon={ICON[v]}>
              {L.lbl[v]}
            </Button>
          ))}
          <Button variant={v} icon={ICON[v]} isDisabled>
            {L.dis}
          </Button>
          <Button variant={v} icon={ICON[v]} isPending>
            {L.load}
          </Button>
        </Row>
      ))}
      <div
        className={`${f.r} caption`}
        style={{
          color: 'var(--ink-muted)',
          marginLeft: 'calc(var(--space-16) + var(--space-6) + var(--space-3))',
        }}
      >
        {L.st.concat([L.dis, L.load]).join(' · ')}
      </div>
      <Row label={L.sizes[0]!}>
        <Button variant="primary" size="sm">
          {L.sizes[1]}
        </Button>
        <Button variant="primary">{L.sizes[2]}</Button>
        <Button variant="primary" size="lg">
          {L.sizes[3]}
        </Button>
      </Row>
      <Row label={L.more[0]!}>
        {/* preview.html cere icon "calendar-plus", dar iconița nu e în registrul bundle.js,
            deci designul randează butonul fără iconiță. */}
        <Button variant="secondary">{L.more[1]}</Button>
        <Button variant="secondary" iconEnd="external-link">
          {L.more[2]}
        </Button>
        <Button variant="quiet" icon="receipt">
          {L.more[3]}
        </Button>
      </Row>
      <Row label={L.blk[0]!}>
        <div style={{ width: 220 }}>
          <Button variant="primary" block>
            {L.blk[1]}
          </Button>
        </div>
        <div style={{ width: 220 }}>
          <Button variant="secondary" block icon="send">
            {L.blk[2]}
          </Button>
        </div>
      </Row>
    </>
  );
}

export default function ButtonGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThStack bare titleClass="caption" render={() => <Set />} />;
}
