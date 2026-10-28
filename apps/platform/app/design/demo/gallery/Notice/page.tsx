/* eslint-disable i18next/no-literal-string */
'use client';
import type React from 'react';
import { notFound } from 'next/navigation';
import { Notice, Button } from '@ventora/ui';
import { GalleryShell } from '../_shared/GalleryShell';

/* c3pair layout — mirrors preview.html c3 structure */
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
const C3STACK: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 };
const C3LAB: React.CSSProperties = { color: 'var(--ink-muted)', margin: 0 };

const T = {
  ro: {
    d: ['E-mailul sau parola nu sunt corecte', 'Verifică-le și încearcă din nou. După 5 încercări îți trimitem un link de resetare.'],
    a: ['Invitația a expirat', 'Invitațiile sunt valabile 7 zile. Bianca Petrașcu îți poate trimite una nouă.', 'Cere o invitație nouă'],
    ok: ['Parola a fost schimbată', 'Te-am deconectat de pe celelalte dispozitive.'],
    n: ['Abonamentul se reînnoiește pe 1 noiembrie', 'Factura ajunge pe e-mail cu 3 zile înainte.'],
    i: ['Mentenanță programată în noaptea de sâmbătă', 'Între 02:00 și 03:00 programările online sunt oprite câteva minute.'],
  },
  de: {
    d: ['E-Mail-Adresse oder Passwort ist nicht korrekt', 'Bitte prüfen Sie beides und versuchen Sie es erneut. Nach 5 Versuchen senden wir Ihnen einen Link zum Zurücksetzen.'],
    a: ['Die Einladung ist abgelaufen', 'Einladungen sind 7 Tage gültig. Bianca Petrașcu kann Ihnen eine neue Einladung senden.', 'Neue Einladung anfragen'],
    ok: ['Ihr Passwort ist geändert', 'Wir haben Sie auf allen anderen Geräten abgemeldet.'],
    n: ['Ihr Abonnement verlängert sich am 1. November', 'Die Rechnung kommt 3 Tage vorher per E-Mail.'],
    i: ['Geplante Wartungsarbeiten in der Nacht auf Sonntag', 'Zwischen 02:00 und 03:00 Uhr sind Online-Buchungen für einige Minuten nicht möglich.'],
  },
  it: {
    d: ["L'e-mail o la password non sono corrette", 'Le controlli e riprovi. Dopo 5 tentativi Le inviamo un link per reimpostare la password.'],
    a: ["L'invito è scaduto", 'Gli inviti sono validi 7 giorni. Bianca Petrașcu può inviarLe un nuovo invito.', 'Richiedi un nuovo invito'],
    ok: ['La Sua password è stata cambiata', 'Abbiamo chiuso la Sua sessione su tutti gli altri dispositivi.'],
    n: ['Il Suo abbonamento si rinnova il 1° novembre', 'La fattura arriva per e-mail 3 giorni prima.'],
    i: ['Manutenzione programmata nella notte di sabato', 'Tra le 02:00 e le 03:00 le prenotazioni online si fermano per qualche minuto.'],
  },
};

type LangKey = keyof typeof T;

function NoticeSet({ t }: { t: (typeof T)[LangKey] }) {
  return (
    <div style={C3STACK}>
      <Notice tone="danger" title={t.d[0]}>{t.d[1]}</Notice>
      <Notice tone="attention" title={t.a[0]} actions={<Button size="sm" variant="secondary">{t.a[2]}</Button>}>{t.a[1]}</Notice>
      <Notice tone="done" title={t.ok[0]}>{t.ok[1]}</Notice>
      <Notice title={t.n[0]}>{t.n[1]}</Notice>
      <Notice icon="wrench" title={t.i[0]}>{t.i[1]}</Notice>
    </div>
  );
}

export default function NoticeGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <GalleryShell>
      <div style={C3WRAP}>
        {/* Light și Dark — comparate cu design (_design din /design/preview/Notice) */}
        <div style={C3PAIR}>
          <div data-gallery-frame data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Light</p>
            <NoticeSet t={T.ro} />
          </div>
          <div data-gallery-frame data-theme="dark" style={C3F}>
            <p className="caption" style={C3LAB}>Dark</p>
            <NoticeSet t={T.ro} />
          </div>
        </div>
        {/* Germană și italiană — etichete mai lungi */}
        <div style={C3PAIR}>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Deutsch (de)</p>
            <NoticeSet t={T.de} />
          </div>
          <div data-theme="light" style={C3F}>
            <p className="caption" style={C3LAB}>Italiano (it)</p>
            <NoticeSet t={T.it} />
          </div>
        </div>
      </div>
    </GalleryShell>
  );
}
