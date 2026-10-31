import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubAdminTeamFrame } from './client';

// preview.html → „Administrarea afacerii — echipă și invitații (proprietar)” → Desktop · 1280, H 900
export default function HubAdminTeamGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Administrarea afacerii — echipă și invitații (proprietar)"
      height={900}
      render={() => <HubAdminTeamFrame />}
    />
  );
}
