/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AccessBadge, AppIcon, APPS, type AccessState, type AppName } from '@ventora/ui';
import { Row, ThPair } from '../_shared/QPair';
import { ACCESS_RO } from '../_shared/labels';

// preview.html → Demo → .thgrid → Frame({ th: "light" }) → Block (RO)
const S: AccessState[] = ['available', 'unavailable', 'notInRole', 'notInPlan'];
const CTX: [AppName, AccessState][] = [
  ['booking', 'available'],
  ['inventory', 'unavailable'],
  ['analytics', 'notInRole'],
  ['marketing', 'notInPlan'],
];

function Block() {
  return (
    <>
      <Row label="Toate stările">
        {S.map((x) => (
          <AccessBadge key={x} state={x} labels={ACCESS_RO} />
        ))}
      </Row>
      <Row label="Îngust: textul trece pe rândul următor">
        {S.map((x) => (
          <div key={x} style={{ width: 136 }}>
            <AccessBadge state={x} labels={ACCESS_RO} />
          </div>
        ))}
      </Row>
      <Row label="Lângă aplicație">
        {CTX.map(([a, x]) => (
          <span key={a} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <AppIcon app={a} size={24} muted={x !== 'available'} />
            <span className="body-strong">{APPS[a]?.name}</span>
            <AccessBadge state={x} labels={ACCESS_RO} />
          </span>
        ))}
      </Row>
    </>
  );
}

export default function AccessBadgeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair render={() => <Block />} />;
}
