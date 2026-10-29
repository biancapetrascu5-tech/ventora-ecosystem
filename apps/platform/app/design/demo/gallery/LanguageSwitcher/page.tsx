/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '@ventora/ui';
import f from '../_shared/frames.module.css';

// preview.html → C3Themes → C3Frame light / dark → LSFrame({ init: "ro", open: th === "dark" })
const LANG = 'Limbă';

function LSFrame({ open }: { open: boolean }) {
  const [l, setL] = useState('ro');
  return (
    <div className={f.c3stack} style={{ minHeight: open ? 320 : undefined }}>
      <div className={f.r}>
        <span className="body-small">Limba interfeței:</span>
        <LanguageSwitcher
          value={l}
          onChange={setL}
          placement="bottom-start"
          defaultOpen={open}
          label={LANG}
        />
        <LanguageSwitcher variant="icon" value={l} onChange={setL} label={LANG} />
      </div>
      <span className="body-small" style={{ color: 'var(--ink-secondary)' }}>
        Ieși din cont · Notificări
      </span>
    </div>
  );
}

export default function LanguageSwitcherGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  // Ca în preview: deasupra secțiunii stă blocul original (min-height 340) și titlul secțiunii.
  // Poziția cadrului în pagină contează: la 390, meniul deschis din cadrul Dark nu mai încape sub
  // buton și se întoarce deasupra lui, exact ca în design.
  return (
    <div className={f.base}>
      <div className={f.c3wrap}>
        <div style={{ minHeight: 340 }} aria-hidden="true" />
        <div className={f.d}>
          <div className={f.c3sec}>
            <p className={`subheading ${f.c3h}`}>Light și Dark</p>
            <div className={f.c3pair}>
              {(['light', 'dark'] as const).map((th) => (
                <div key={th} className={f.c3f} data-gallery-frame data-theme={th}>
                  <p className={`caption ${f.c3lab}`}>{th === 'dark' ? 'Dark' : 'Light'}</p>
                  <LSFrame open={th === 'dark'} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
