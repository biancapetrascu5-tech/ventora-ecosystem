/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AppDock, type DockApp } from '@ventora/ui';
import { APPTILE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Theme({ th: "light" }) / Theme({ th: "dark" }): repaus pe bandă, hover pe ClientDesk
// (în dark și focus de tastatură), telefon
const APPS: DockApp[] = [
  {
    app: 'booking',
    description: 'Programări, calendar și reamintiri',
    badge: 3,
    live: { text: 'Următoarea: 09:30 · Ana Popescu' },
  },
  {
    app: 'crm',
    description: 'Clienți, istoric și oportunități',
    live: { text: '4 clienți noi săptămâna asta' },
  },
  {
    app: 'hr',
    description: 'Echipă, prezență și concedii',
    badge: 1,
    live: { text: '1 cerere de aprobat', attention: true },
  },
  {
    app: 'finance',
    description: 'Facturi, scadențe și restanțe',
    badge: 2,
    live: { text: '2 facturi scadente · 2.480 lei', attention: true },
  },
  {
    app: 'projects',
    description: 'Proiecte, sarcini și termene',
    live: { text: '3 termene săptămâna asta' },
  },
  { app: 'shifts', description: 'Ture și înlocuiri', live: { text: 'Azi lucrează 4 colegi' } },
  {
    app: 'documents',
    description: 'Documente și șabloane',
    live: { text: 'Ultimul deschis: Contract Salon Aurora · ieri' },
  },
];
const LABEL = 'Aplicațiile tale';
const Lab = ({ children }: { children: React.ReactNode }) => (
  <p className="caption" style={{ margin: '0 0 var(--space-2)', color: 'var(--ink-muted)' }}>
    {children}
  </p>
);

function Theme({ th }: { th: 'light' | 'dark' }) {
  return (
    <div className={f.dockd} data-gallery-frame data-theme={th}>
      <p className="heading">{th === 'light' ? 'Light' : 'Dark'}</p>
      <div>
        <Lab>Repaus, peste marginea benzii de brand · treci cu mouse-ul peste o aplicație</Lab>
        <div className={`${f.stage} ${f.band}`}>
          <AppDock apps={APPS} label={LABEL} tileLabels={APPTILE_RO} />
        </div>
      </div>
      <div className={f.dockrow}>
        <div>
          <Lab>
            Hover sau focus de tastatură pe ClientDesk: iconul se deschide în fișa aplicației
          </Lab>
          <div className={f.stage}>
            <AppDock
              apps={APPS}
              label={LABEL}
              tileLabels={APPTILE_RO}
              hoverIndex={1}
              focusIndex={th === 'dark' ? 1 : undefined}
            />
          </div>
        </div>
        <div>
          <Lab>Telefon: grilă de iconuri, fără fișă</Lab>
          <div className={f.dockphone}>
            <AppDock apps={APPS} label={LABEL} tileLabels={APPTILE_RO} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppDockGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className={f.base}>
      <Theme th="light" />
      <Theme th="dark" />
    </div>
  );
}
