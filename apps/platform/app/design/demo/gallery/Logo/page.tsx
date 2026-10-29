/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Logo } from '@ventora/ui';
import { Row } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → C3_ORIG → .logosets → LogoSet({ th: "light" }) / LogoSet({ th: "dark" })
function LogoSet({ th }: { th: 'light' | 'dark' }) {
  return (
    <div className={f.logoset} data-gallery-frame data-theme={th}>
      <p className={`caption ${f.muted}`}>{th === 'light' ? 'Light' : 'Dark · varianta B'}</p>
      <Row label="Complet">
        <Logo size={32} />
        <Logo size={24} />
        <Logo size={21} />
      </Row>
      <Row label="Semnul">
        <Logo variant="mark" size={64} />
        <Logo variant="mark" size={40} />
        <Logo variant="mark" size={24} />
        <Logo variant="mark" size={16} />
      </Row>
      <Row label="Favicon">
        <span className={f.favtab}>
          <Logo variant="mark" size={16} title="" />
          <span className="caption">Ventora</span>
        </span>
        <span className={f.favtab}>
          <Logo variant="mark" size={16} title="" />
          <span className="caption">Programări · Ventora</span>
        </span>
      </Row>
    </div>
  );
}

export default function LogoGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.c3wrap}>
        <div className={f.d}>
          <div className={f.logosets}>
            <LogoSet th="light" />
            <LogoSet th="dark" />
          </div>
        </div>
      </div>
    </div>
  );
}
