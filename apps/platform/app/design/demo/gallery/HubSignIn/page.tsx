import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubSignInFrame } from './client';

// preview.html → Screens „Autentificare — doar prin invitație” → Desktop · 1280, H 860
export default function HubSignInGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Autentificare — doar prin invitație"
      height={860}
      render={() => <HubSignInFrame />}
    />
  );
}
