/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { UsageMeter } from '@ventora/ui';
import { GalleryShell } from '../../_shared/GalleryShell';
import ro from '@ventora/i18n/messages/ro.json';

function tpl(str: string, args: Record<string, string>) {
  return Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
}

const DG2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(var(--search-width), 1fr))',
  gap: 'var(--space-4) var(--space-6)',
  alignItems: 'start',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

const frame: React.CSSProperties = {
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--sheet)',
  boxSizing: 'border-box',
  padding: 'var(--space-4)',
};

const roProps = {
  locale: 'ro' as const,
  unlimitedLabel: ro.usageMeter.unlimited,
  usedOfLabel: ({ used, limit }: { used: string; limit: string }) =>
    tpl(ro.usageMeter.usedOf, { used, limit }),
  leftLabel: ({ n }: { n: string }) => tpl(ro.usageMeter.left, { n }),
  nearLimitLabel: ro.usageMeter.nearLimit,
  atLimitLabel: ro.usageMeter.atLimit,
  atLimitHint: ro.usageMeter.atLimitHint,
  upgradeLabel: ro.usageMeter.upgrade,
  buyMoreLabel: ro.usageMeter.buyMore,
  notifyOwnerLabel: ro.usageMeter.notifyOwner,
  onlyOwnerBuysLabel: ({ who }: { who: string }) => tpl(ro.usageMeter.onlyOwnerBuys, { who }),
};

export default function UsageMeterExtraPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={DG2}>
        <div style={frame}>
          <UsageMeter
            {...roProps}
            label="Locuri în echipă"
            used={10}
            limit={10}
            onBuy={() => {}}
            buyLabel={`${ro.usageMeter.buyMore} · 49 lei`}
          />
        </div>
        <div style={frame}>
          <UsageMeter
            {...roProps}
            label="Locuri în echipă"
            used={10}
            limit={10}
            owner="Maria Constantin"
            onNotifyOwner={() => {}}
          />
        </div>
        <div style={{ ...frame, maxWidth: 'var(--spine-width)' }}>
          <UsageMeter
            {...roProps}
            compact
            label="Programări"
            used={1000}
            limit={1000}
            onBuy={() => {}}
            buyLabel={ro.usageMeter.buyMore}
          />
        </div>
      </div>
    </GalleryShell>
  );
}
