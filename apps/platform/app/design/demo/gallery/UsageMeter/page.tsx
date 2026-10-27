/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { UsageMeter } from '@ventora/ui';
import { GalleryShell, GallerySection } from '../_shared/GalleryShell';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';

function tpl(str: string, args: Record<string, string>) {
  return Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
}

const frame = {
  padding: 'var(--space-4)',
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--sheet)',
} as const;

const roProps = {
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

const deProps = {
  unlimitedLabel: de.usageMeter.unlimited,
  usedOfLabel: ({ used, limit }: { used: string; limit: string }) =>
    tpl(de.usageMeter.usedOf, { used, limit }),
  leftLabel: ({ n }: { n: string }) => tpl(de.usageMeter.left, { n }),
  nearLimitLabel: de.usageMeter.nearLimit,
  atLimitLabel: de.usageMeter.atLimit,
  atLimitHint: de.usageMeter.atLimitHint,
  upgradeLabel: de.usageMeter.upgrade,
  buyMoreLabel: de.usageMeter.buyMore,
  notifyOwnerLabel: de.usageMeter.notifyOwner,
  onlyOwnerBuysLabel: ({ who }: { who: string }) => tpl(de.usageMeter.onlyOwnerBuys, { who }),
};

export default function UsageMeterGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell title="UsageMeter">
      <GallerySection label="RO — stare ok" column>
        <div style={frame}>
          <UsageMeter {...roProps} label="Programări luna aceasta" used={312} limit={1000} />
        </div>
        <div style={frame}>
          <UsageMeter
            {...roProps}
            label="Spațiu documente"
            used={2.4}
            limit={5}
            unit="GB"
            format={(n) => n.toLocaleString('ro-RO')}
          />
        </div>
        <div style={frame}>
          <UsageMeter {...roProps} label="Clienți" used={4210} />
        </div>
      </GallerySection>
      <GallerySection label="RO — stare warn" column>
        <div style={frame}>
          <UsageMeter {...roProps} label="SMS-uri" used={862} limit={1000} onUpgrade={() => {}} />
        </div>
      </GallerySection>
      <GallerySection label="RO — stare limită (owner)" column>
        <div style={frame}>
          <UsageMeter
            {...roProps}
            label="Angajați"
            used={10}
            limit={10}
            onBuy={() => {}}
            buyLabel={`${ro.usageMeter.buyMore} · 9,99 €`}
          />
        </div>
        <div style={frame}>
          <UsageMeter
            {...roProps}
            label="Angajați"
            used={10}
            limit={10}
            owner="Maria Constantin"
            onNotifyOwner={() => {}}
          />
        </div>
      </GallerySection>
      <GallerySection label="Compact">
        <div style={{ ...frame, width: '280px' }}>
          <UsageMeter
            {...roProps}
            compact
            label="Programări"
            used={980}
            limit={1000}
            onUpgrade={() => {}}
          />
        </div>
        <div style={{ ...frame, width: '280px' }}>
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
      </GallerySection>
      <GallerySection label="DE — stare limită" column>
        <div style={frame}>
          <UsageMeter
            {...deProps}
            label="SMS-Kontingent diesen Monat"
            used={1000}
            limit={1000}
            onUpgrade={() => {}}
          />
        </div>
      </GallerySection>
    </GalleryShell>
  );
}
