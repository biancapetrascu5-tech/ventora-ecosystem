/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { AppTile } from '@ventora/ui';
import { ThStack } from '../_shared/QPair';
import { APPTILE_RO } from '../_shared/labels';
import f from '../_shared/frames.module.css';

// preview.html → Demo → Frame({ th: "light" }) / Frame({ th: "dark" }) → Set(T.ro)
const noop = () => {};
const L = APPTILE_RO;
const OWNER = 'Bianca Petrașcu';
const D = {
  booking: 'Programări, calendar și reamintiri.',
  crm: 'Clienți, istoric și oportunități.',
  hr: 'Echipă, prezență și concedii.',
  finance: 'Facturi, scadențe și restanțe.',
};
const Lab = ({ children }: { children: React.ReactNode }) => (
  <p className={`caption ${f.lab}`}>{children}</p>
);

function Set() {
  return (
    <>
      <Lab>Disponibilă · implicit, hover, focus, apăsat</Lab>
      <div className={f.tiles}>
        <AppTile app="booking" description={D.booking} badge={3} onOpen={noop} labels={L} />
        <AppTile app="crm" description={D.crm} state="hover" onOpen={noop} labels={L} />
        <AppTile app="hr" description={D.hr} state="focus" onOpen={noop} labels={L} />
        <AppTile app="finance" description={D.finance} state="pressed" onOpen={noop} labels={L} />
      </div>
      <Lab>Cele trei stări blocate (plăcuță estompată)</Lab>
      <div className={f.tiles}>
        <AppTile app="inventory" access="unavailable" onSeeStatus={noop} labels={L} />
        <AppTile
          app="analytics"
          access="notInRole"
          grantedBy={OWNER}
          onRequestAccess={noop}
          labels={L}
        />
        <AppTile app="marketing" access="notInPlan" onWriteUs={noop} labels={L} />
        <AppTile app="projects" access="notInRole" labels={L} />
      </div>
      <Lab>Layout „row” · Alte aplicații Ventora</Lab>
      <div
        className={f.sheetlike}
        style={{
          padding: 'var(--space-2) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AppTile layout="row" app="events" access="notInPlan" onWriteUs={noop} labels={L} />
        <AppTile
          layout="row"
          app="contracts"
          access="notInRole"
          grantedBy={OWNER}
          onRequestAccess={noop}
          labels={L}
        />
        <AppTile
          layout="row"
          app="assets"
          access="unavailable"
          reason="Facem o actualizare. Revine azi la 14:00, iar datele tale rămân neatinse."
          onSeeStatus={noop}
          labels={L}
        />
      </div>
      <Lab>Layout „icon” · în AppDock</Lab>
      <div className={f.r} style={{ gap: 'var(--space-4)', alignItems: 'flex-start' }}>
        <AppTile
          layout="icon"
          app="booking"
          description={D.booking}
          badge={3}
          onOpen={noop}
          labels={L}
        />
        <AppTile layout="icon" app="crm" description={D.crm} onOpen={noop} labels={L} />
        <AppTile
          layout="icon"
          app="contracts"
          description="Contracte, semnături și termene."
          onOpen={noop}
          labels={L}
        />
      </div>
    </>
  );
}

export default function AppTileGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThStack bare titleClass="caption" render={() => <Set />} />;
}
