/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Badge, Icon } from '@ventora/ui';
import { Row, ThPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Demo → primul thgrid → Set({ L: T.ro })
const RO = {
  lbl: ['Număr', 'Etichetă', 'Punct', 'În context'],
  unread: '3 necitite',
  dotL: 'Necitit',
  ctx: [
    ['Programări', 3, 'attention', '3 programări neconfirmate'],
    ['Notificări', 12, 'attention', '12 notificări necitite'],
    ['Clienți activi', 248, 'neutral', '248 de clienți activi'],
  ] as const,
  tags: ['Nou', 'Pro', 'Beta', 'Încercare gratuită'],
};

function BadgeSet() {
  const L = RO;
  return (
    <>
      <Row label={L.lbl[0]}>
        <Badge tone="attention" count={3} label={L.unread} locale="ro" />
        <Badge tone="attention" count={128} locale="ro" />
        <Badge count={12} locale="ro" />
        <Badge tone="primary" count={5} locale="ro" />
        <Badge count={1284} max={999} locale="ro" />
      </Row>
      <Row label={L.lbl[1]}>
        {L.tags.map((t, i) => (
          <Badge key={t} tone={i === 1 ? 'primary' : 'neutral'}>
            {t}
          </Badge>
        ))}
      </Row>
      <Row label={L.lbl[2]}>
        <Badge dot tone="attention" label={L.dotL} />
        <Badge dot tone="neutral" />
        <Badge dot tone="primary" />
      </Row>
      <Row label={L.lbl[3]}>
        {L.ctx.map(([t, n, tone, a]) => (
          <span key={t} className={f.r} style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
            <Icon icon={tone === 'attention' ? 'bell' : 'users'} size={16} />
            <span className="body">{t}</span>
            <Badge tone={tone} count={n} max={999} label={a} locale="ro" />
          </span>
        ))}
      </Row>
    </>
  );
}

export default function BadgeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair render={() => <BadgeSet />} />;
}
