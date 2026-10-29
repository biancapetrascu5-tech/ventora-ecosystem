/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Button, DiscoveryTooltip, IconButton } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import { DISCO_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame light / dark → Board({ lang: "ro" })
const noop = () => {};
const T = {
  l: [
    'Funcționalitate, lângă butonul ei · jos, la stânga',
    'Aplicație (comercial: cu eticheta „Recomandare”), aliniat la dreapta',
    'Deasupra elementului, când jos nu e loc · fără „Vezi cum funcționează”',
    'Închis (după „Am înțeles” nu mai apare)',
  ],
  t1: 'Exportul merge și pentru contabil',
  b1: 'Alegi perioada și primești un fișier pe care contabilul îl deschide direct.',
  btn1: 'Exportă',
  t2: 'Clienții din EasyBook pot intra în ClientDesk',
  b2: 'Fiecare client primește istoric, note și pasul următor. Vezi detaliile în catalog.',
  btn2: 'Clienți',
  t3: 'Mută programarea trăgând-o',
  b3: 'Sau deschide-o și alege „Mută programarea”.',
  btn3: 'Calendar',
  note: 'Cel mult unul pe ecran · după „Am înțeles” nu mai apare · pe ecranele tactile e același card ancorat, nu apare la hover · nu acoperă câmpuri sau butoane în uz.',
};

function Board() {
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      <div className={f.pvGrid2} style={{ rowGap: 'var(--space-8)' }}>
        <PvCell label={T.l[0]!} style={{ minHeight: 250 }}>
          <div className={f.r}>
            <DiscoveryTooltip
              title={T.t1}
              body={T.b1}
              onGotIt={noop}
              onLearnMore={noop}
              labels={DISCO_RO}
            >
              <Button icon="download">{T.btn1}</Button>
            </DiscoveryTooltip>
          </div>
        </PvCell>
        <PvCell label={T.l[1]!} style={{ minHeight: 250 }}>
          <div className={f.r} style={{ justifyContent: 'flex-end' }}>
            <DiscoveryTooltip
              commercial
              align="end"
              title={T.t2}
              body={T.b2}
              onGotIt={noop}
              onLearnMore={noop}
              labels={DISCO_RO}
            >
              <IconButton icon="users" label={T.btn2} variant="secondary" />
            </DiscoveryTooltip>
          </div>
        </PvCell>
        <PvCell label={T.l[2]!} style={{ minHeight: 230 }}>
          <div className={f.r} style={{ marginTop: 170 }}>
            <DiscoveryTooltip
              placement="top"
              title={T.t3}
              body={T.b3}
              onGotIt={noop}
              labels={DISCO_RO}
            >
              <Button icon="calendar">{T.btn3}</Button>
            </DiscoveryTooltip>
          </div>
        </PvCell>
        <PvCell label={T.l[3]!}>
          <div className={f.r}>
            <DiscoveryTooltip open={false} title={T.t1} onGotIt={noop} labels={DISCO_RO}>
              <Button icon="download">{T.btn1}</Button>
            </DiscoveryTooltip>
          </div>
        </PvCell>
      </div>
      <p className={`body-small ${f.pvNote}`}>{T.note}</p>
    </div>
  );
}

export default function DiscoveryTooltipGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
