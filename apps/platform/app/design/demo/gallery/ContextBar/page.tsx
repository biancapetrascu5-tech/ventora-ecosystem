/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AppShell, BrandZone, Logo, Spine } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import { Bar, SECTIONS } from '../_shared/shell';
import { SPINE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame light / dark → Board({ lang: "ro" })
const L = [
  'Desktop · afacere, căutare cu ⌘K, „Creează”, notificări, cont',
  'Tabletă · 820 (căutarea devine icon)',
  'Telefon · 390 (afacerea trece în meniul contului, „Creează” devine buton rotund)',
  'Launcher Hub (BrandZone, direcția B)',
];

function Board() {
  return (
    <div className={f.pvCell} style={{ gap: 'var(--space-5)' }}>
      <PvCell label={L[0]!}>
        <div className={f.frame} style={{ background: 'var(--canvas)', overflow: 'hidden' }}>
          <Bar />
        </div>
      </PvCell>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-5)',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <PvCell label={L[1]!} style={{ width: 820, maxWidth: '100%' }}>
          <div
            className={f.pvStage}
            style={{ height: 'calc(var(--contextbar-height) + var(--space-2))' }}
          >
            <AppShell height="100%" contextBar={<Bar title="Aplicațiile tale" />} />
          </div>
        </PvCell>
        <PvCell label={L[2]!} style={{ width: 390 }}>
          <div
            className={f.phone}
            style={{
              height: 'calc(var(--contextbar-height) + var(--bottomnav-height) + var(--space-8))',
            }}
          >
            <AppShell
              height="100%"
              spine={
                <Spine
                  app="booking"
                  appName="EasyBook"
                  labels={SPINE_RO}
                  sections={SECTIONS}
                  activeId="azi"
                />
              }
              contextBar={<Bar title="EasyBook" />}
            />
          </div>
        </PvCell>
      </div>
      <PvCell label={L[3]!}>
        <BrandZone style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <Bar
            hub
            leading={
              <span style={{ padding: '0 var(--space-2)', display: 'inline-flex' }}>
                <Logo size={32} />
              </span>
            }
          />
        </BrandZone>
      </PvCell>
    </div>
  );
}

export default function ContextBarGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
