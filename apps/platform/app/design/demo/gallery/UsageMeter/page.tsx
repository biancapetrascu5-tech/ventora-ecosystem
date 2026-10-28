/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { UsageMeter } from '@ventora/ui';
import ro from '@ventora/i18n/messages/ro.json';
import f from '../_shared/frames.module.css';

// preview.html → .um → section.um-frame (Light, Dark) → Board (ro)
function tpl(str: string, args: Record<string, string>) {
  return Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
}

const L = {
  locale: 'ro',
  unlimitedLabel: ro.usageMeter.unlimited,
  usedOfLabel: (a: { used: string; limit: string }) => tpl(ro.usageMeter.usedOf, a),
  leftLabel: (a: { n: string }) => tpl(ro.usageMeter.left, a),
  nearLimitLabel: ro.usageMeter.nearLimit,
  atLimitLabel: ro.usageMeter.atLimit,
  atLimitHint: ro.usageMeter.atLimitHint,
  upgradeLabel: ro.usageMeter.upgrade,
  buyMoreLabel: ro.usageMeter.buyMore,
  notifyOwnerLabel: ro.usageMeter.notifyOwner,
  onlyOwnerBuysLabel: (a: { who: string }) => tpl(ro.usageMeter.onlyOwnerBuys, a),
};

const T = {
  appts: 'Programări luna aceasta',
  sms: 'SMS-uri luna aceasta',
  staff: 'Angajați',
  docs: 'Spațiu documente',
  clients: 'Clienți',
  buy: 'Cumpără pachet · 49 lei',
  owner: 'Bianca Petrașcu',
  short: 'Programări',
};
const noop = () => {};

function Cell({ label, w, children }: { label: string; w?: number; children: React.ReactNode }) {
  return (
    <div className={f.umCell} style={w ? { maxWidth: w } : undefined}>
      <p className={`caption ${f.pvLab}`}>{label}</p>
      <div className={f.umBody}>{children}</div>
    </div>
  );
}

function Board() {
  return (
    <div className={f.umGrid}>
      <Cell label="1 · Sub prag: „Mai ai 688”">
        <UsageMeter label={T.appts} used={312} limit={1000} onUpgrade={noop} {...L} />
      </Cell>
      <Cell label="2 · Aproape de limită · proprietar">
        <UsageMeter
          label={T.sms}
          used={862}
          limit={1000}
          onBuy={noop}
          buyLabel={T.buy}
          onUpgrade={noop}
          {...L}
        />
      </Cell>
      <Cell label="3 · Aproape de limită · ceilalți">
        <UsageMeter
          label={T.sms}
          used={862}
          limit={1000}
          owner={T.owner}
          onNotifyOwner={noop}
          {...L}
        />
      </Cell>
      <Cell label="4 · La limită · proprietar">
        <UsageMeter
          label={T.staff}
          used={10}
          limit={10}
          onBuy={noop}
          buyLabel={T.buy}
          onUpgrade={noop}
          {...L}
        />
      </Cell>
      <Cell label="5 · La limită · ceilalți">
        <UsageMeter
          label={T.staff}
          used={10}
          limit={10}
          owner={T.owner}
          onNotifyOwner={noop}
          {...L}
        />
      </Cell>
      <Cell label="6 · Cu unitate și format; nelimitat">
        <UsageMeter
          label={T.docs}
          used={2.4}
          limit={5}
          unit="GB"
          format={(n) => n.toLocaleString('ro-RO')}
          {...L}
        />
        <div style={{ height: 16 }} />
        <UsageMeter label={T.clients} used={4210} {...L} />
      </Cell>
      <Cell label="7 · Compact (subsolul Spine) · aproape și la limită" w={280}>
        <UsageMeter
          compact
          label={T.short}
          used={980}
          limit={1000}
          onBuy={noop}
          buyLabel={T.buy}
          onUpgrade={noop}
          {...L}
        />
        <div style={{ height: 16 }} />
        <UsageMeter
          compact
          label={T.short}
          used={1000}
          limit={1000}
          owner={T.owner}
          onNotifyOwner={noop}
          {...L}
        />
      </Cell>
    </div>
  );
}

export default function UsageMeterGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.pv}>
        {(['light', 'dark'] as const).map((th) => (
          <section key={th} className={f.pvFrame} data-gallery-frame data-theme={th}>
            <p className="heading">{th === 'light' ? 'Light' : 'Dark'}</p>
            <Board />
          </section>
        ))}
      </div>
    </div>
  );
}
