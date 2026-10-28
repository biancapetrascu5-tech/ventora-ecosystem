/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AccountMenu } from '@ventora/ui';
import { ACCOUNT_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → .am (6 coloane) → Col({ th: "light", label: "Light · desktop…" }) și coloana Dark · desktop.
// Galeria păstrează grila de 6 coloane, ca lățimea cadrelor să fie aceeași; coloanele de telefon
// și DE/IT rămân goale (meniurile lor, ancorate în afara cadrelor, nu intră în capturi).
const USER = { name: 'Bianca Petrașcu', email: 'bianca@salonaurora.ro' };
const noop = () => {};

function Col({ th, label }: { th: 'light' | 'dark'; label: string }) {
  return (
    <div className={f.amCol} data-gallery-frame data-theme={th}>
      <p className={`caption ${f.amLab}`}>{label}</p>
      <div className={f.amBar}>
        <AccountMenu
          defaultOpen
          user={USER}
          locale="ro"
          onLocaleChange={noop}
          theme="system"
          onThemeChange={noop}
          onCatalog={noop}
          labels={ACCOUNT_RO}
        />
      </div>
    </div>
  );
}

const Empty = ({ th }: { th: 'light' | 'dark' }) => <div className={f.amCol} data-theme={th} />;

export default function AccountMenuGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.am}>
        <Col th="light" label="Light · desktop: afacerea se schimbă din ContextBar" />
        <Empty th="light" />
        <Col th="dark" label="Dark · desktop" />
        <Empty th="dark" />
        <Empty th="light" />
        <Empty th="dark" />
      </div>
    </div>
  );
}
