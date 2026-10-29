/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AppIcon, BrandZone, Button, Icon, Logo } from '@ventora/ui';
import f from '../_shared/frames.module.css';

// preview.html → Theme({ th: "light" }) / Theme({ th: "dark" }) → Zone(BZ.ro)
function Zone() {
  return (
    <BrandZone className={f.zone}>
      <div className={f.bzrow} style={{ justifyContent: 'space-between' }}>
        <Logo size={32} />
        <span className={f.field}>
          <Icon icon="search" size={16} />
          Caută…
        </span>
      </div>
      <p className={`eyebrow ${f.eb}`}>Duminică, 25 octombrie · Salon Aurora</p>
      <p className="display-hub">Bună dimineața, Bianca</p>
      <p className={`lead ${f.sec}`}>Text secundar pe zona de brand: on-brand-muted.</p>
      <div className={f.bzrow}>
        <span className={f.chip}>
          <AppIcon app="finance" size={20} />2 facturi scadente
          <span className={f.chipDot} aria-hidden="true" />
        </span>
        <Button size="sm" variant="quiet" icon="grip-vertical">
          Reordonează
        </Button>
      </div>
    </BrandZone>
  );
}

function Theme({ th }: { th: 'light' | 'dark' }) {
  return (
    <div className={f.bzd} data-gallery-frame data-theme={th}>
      <p className="heading">{th === 'light' ? 'Light' : 'Dark'}</p>
      <p className={`caption ${f.lab0}`}>
        {th === 'light' ? 'Navy #000C3F' : 'Negru rece #1B1D23 (navy nu e suprafață în dark)'}
      </p>
      <Zone />
    </div>
  );
}

export default function BrandZoneGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <Theme th="light" />
      <Theme th="dark" />
    </div>
  );
}
