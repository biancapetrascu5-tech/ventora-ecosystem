/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { UsageMeter } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';
import ro from '@ventora/i18n/messages/ro.json';
import de from '@ventora/i18n/messages/de.json';

const C3WRAP: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};
const C3PAIR: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
  gap: 'var(--space-4)',
  alignItems: 'start',
};
const C3F: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  border: 'var(--border-width) solid var(--line)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--canvas)',
  color: 'var(--ink)',
  minWidth: 0,
  boxSizing: 'border-box',
};
const C3STACK: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  minWidth: 0,
};
const C3LAB: React.CSSProperties = { color: 'var(--ink-muted)', margin: 0 };

function tpl(str: string, args: Record<string, string>) {
  return Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
}

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

const deProps = {
  locale: 'de' as const,
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

function UsageSet({ locale }: { locale: 'ro' | 'de' }) {
  const props = locale === 'de' ? deProps : roProps;
  return (
    <div style={C3STACK}>
      {/* OK */}
      <UsageMeter
        {...props}
        label={locale === 'de' ? 'Termine diesen Monat' : 'Programări luna aceasta'}
        used={312}
        limit={1000}
        onUpgrade={() => {}}
      />
      {/* Warn — separator la 4 cifre: 1.284 */}
      <UsageMeter
        {...props}
        label={locale === 'de' ? 'SMS-Kontingent' : 'SMS-uri'}
        used={1284}
        limit={1500}
        onUpgrade={() => {}}
      />
      {/* At limit — cu upgrade */}
      <UsageMeter
        {...props}
        label={locale === 'de' ? 'Mitarbeiter' : 'Angajați'}
        used={10}
        limit={10}
        onUpgrade={() => {}}
      />
      {/* Unlimited */}
      <UsageMeter {...props} label={locale === 'de' ? 'Kunden' : 'Clienți'} used={4210} />
      {/* Compact */}
      <UsageMeter
        {...props}
        compact
        label={locale === 'de' ? 'Termine' : 'Programări'}
        used={980}
        limit={1000}
        onUpgrade={() => {}}
      />
    </div>
  );
}

export default function UsageMeterGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>
              Light
            </p>
            <UsageSet locale="ro" />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>
              Dark
            </p>
            <UsageSet locale="ro" />
          </div>
        </div>
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>
              Deutsch (de)
            </p>
            <UsageSet locale="de" />
          </div>
          <div data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>
              Deutsch · Dark
            </p>
            <UsageSet locale="de" />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
