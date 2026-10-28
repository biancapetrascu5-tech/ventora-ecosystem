/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Avatar, AvatarGroup } from '@ventora/ui';
import type { AvatarSize, AvatarStatus } from '@ventora/ui';
import { Row, ThPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Demo → primul thgrid → Set({ L: T.ro })
const L = {
  lbl: ['Mărimi', 'Stare', 'Formă', 'Grup', 'În context'],
  me: 'Bianca Petrașcu',
  st: [
    ['Ștefan Țăranu', 'done', 'Disponibil'],
    ['Mara Enache', 'attention', 'Te așteaptă'],
    ['Ilinca Ștefănescu', 'danger', 'Absentă'],
    ['Radu Matei', 'neutral', 'În pauză'],
    ['Ioana Pavel', 'offline', 'Deconectată'],
  ] as [string, AvatarStatus, string][],
  biz: ['Salon Aurora', 'Clinica Dentis Sibiu'],
  people: [
    'Ana Popescu',
    'Andrei Ionescu',
    'Bianca Marin',
    'Cristina Dobre',
    'Dan Stoica',
    'Elena Georgescu',
    'Ioana Pavel',
  ],
  ctx: ['Ștefan Țăranu', 'Coafor · lucrează azi 09:00–17:00'],
};
const SIZES: AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const NOWRAP2 = { gap: 'var(--space-2)', flexWrap: 'nowrap' } as const;

function AvatarSet() {
  const people = L.people.map((name) => ({ name }));
  return (
    <>
      <Row label={L.lbl[0]}>
        {SIZES.map((s) => (
          <Avatar key={s} size={s} name={L.me} />
        ))}
      </Row>
      <Row label={L.lbl[1]}>
        {L.st.map(([n, s, t]) => (
          <span key={n} className={f.r} style={NOWRAP2}>
            <Avatar name={n} status={s} />
            <span className="body-small">{t}</span>
          </span>
        ))}
      </Row>
      <Row label={L.lbl[2]}>
        <Avatar name={L.st[0][0]} />
        {L.biz.map((b) => (
          <span key={b} className={f.r} style={NOWRAP2}>
            <Avatar name={b} shape="square" />
            <span className="body">{b}</span>
          </span>
        ))}
      </Row>
      <Row label={L.lbl[3]}>
        <AvatarGroup people={people} max={4} locale="ro" />
        <AvatarGroup people={people.slice(0, 3)} size="md" locale="ro" />
        <AvatarGroup people={people} max={3} size="lg" locale="ro" />
      </Row>
      <Row label={L.lbl[4]}>
        <span className={f.r} style={{ gap: 'var(--space-3)', flexWrap: 'nowrap' }}>
          <Avatar name={L.ctx[0]} size="lg" status="done" />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="body-strong">{L.ctx[0]}</span>
            <span className="body-small" style={{ color: 'var(--ink-secondary)' }}>
              {L.ctx[1]}
            </span>
          </span>
        </span>
      </Row>
    </>
  );
}

export default function AvatarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair render={() => <AvatarSet />} />;
}
