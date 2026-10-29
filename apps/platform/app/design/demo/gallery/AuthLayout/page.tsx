/* eslint-disable i18next/no-literal-string */
'use client';
import { useState } from 'react';
import { notFound } from 'next/navigation';
import { AuthLayout, Button, FormField, Input, LanguageSwitcher } from '@ventora/ui';
import f from '../_shared/frames.module.css';

// preview.html → ARow „Hub: panoul de brand…” → div.scr-d light (1280) / div.scr-d dark, H 640
function Lang() {
  const [l, setL] = useState('ro');
  return <LanguageSwitcher value={l} onChange={setL} label="Limbă" />;
}

function Zones() {
  return (
    <div className={f.zl}>
      <p className="subheading" style={{ margin: 0 }}>
        Formularul de aici e doar un exemplu: în AuthLayout intră orice formular de intrare
      </p>
      <FormField label="E-mail">
        <Input type="email" iconStart="mail" defaultValue="bianca@salonaurora.ro" />
      </FormField>
      <Button variant="primary" size="lg" block>
        Intră în cont
      </Button>
    </div>
  );
}

function Screen({ th }: { th: 'light' | 'dark' }) {
  return (
    <div>
      <p className={`caption ${f.scrLab}`}>Desktop · 1280 · {th === 'light' ? 'Light' : 'Dark'}</p>
      <div
        className={`${f.scr} ${f.scrD}`}
        data-gallery-frame
        data-theme={th}
        style={{ height: 640 }}
      >
        <AuthLayout
          languageSelector={<Lang />}
          footer="Termeni · Confidențialitate · Ajutor"
          statement={
            <>
              Afacerea ta.
              <br />
              Într-un singur loc.
            </>
          }
        >
          <Zones />
        </AuthLayout>
      </div>
    </div>
  );
}

export default function AuthLayoutGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <div className={f.scrWrap}>
        <p className="heading">
          Hub: panoul de brand, foaia cu formularul, pe telefon banda cu logo-ul
        </p>
        <div className={f.scrRow}>
          <Screen th="light" />
        </div>
        <div className={f.scrRow}>
          <Screen th="dark" />
        </div>
      </div>
    </div>
  );
}
