/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubAdminPlanFrame } from './client';

// preview.html → „Administrarea afacerii — abonament, consum, pachete în plus cumpărate cu cardul,
// facturi” → Desktop · 1280, H 1580.
export default function HubAdminPlanGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Administrarea afacerii — abonament, consum, pachete în plus cumpărate cu cardul, facturi"
      height={1580}
      render={() => <HubAdminPlanFrame />}
    />
  );
}
