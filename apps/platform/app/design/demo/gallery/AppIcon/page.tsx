/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { APP_IDS, AppIcon, APPS } from '@ventora/ui';
import f from '../_shared/frames.module.css';

// preview.html → Demo → .two → Panel({ theme: "light" }) / Panel({ theme: "dark" })
function Family({ muted }: { muted?: boolean }) {
  return (
    <div className={f.fam}>
      {APP_IDS.map((a) => (
        <div key={a} className={f.famcell}>
          <AppIcon app={a} size={56} muted={muted} title={APPS[a]?.name} />
          <span className="caption">{APPS[a]?.name}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({ theme }: { theme: 'light' | 'dark' }) {
  const t = theme === 'dark' ? 'Dark' : 'Light';
  return (
    <div className={f.panel} data-gallery-frame data-theme={theme}>
      <p className={`caption ${f.lab}`}>{t} · activă</p>
      <Family />
      <p className={`caption ${f.lab}`}>{t} · inactivă</p>
      <Family muted />
      <p className={`caption ${f.lab}`}>24px — trebuie să rămână distincte</p>
      <div className={f.r} style={{ gap: 'var(--space-3)' }}>
        {APP_IDS.map((a) => (
          <AppIcon key={a} app={a} size={24} />
        ))}
      </div>
      <div className={f.r} style={{ gap: 'var(--space-3)' }}>
        {APP_IDS.map((a) => (
          <AppIcon key={a} app={a} size={24} muted />
        ))}
      </div>
      <p className={`caption ${f.lab}`}>Mărimi</p>
      <div className={f.r} style={{ alignItems: 'flex-end', gap: 'var(--space-4)' }}>
        {[96, 64, 48, 40, 32, 24, 20, 16].map((s) => (
          <span key={s} className={f.sz}>
            <AppIcon app="booking" size={s} />
            <span className="caption">{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AppIconGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.two}>
        <Panel theme="light" />
        <Panel theme="dark" />
      </div>
    </div>
  );
}
