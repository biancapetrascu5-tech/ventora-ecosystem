import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubTwoFactorVerifyFrame } from './client';

// preview.html → Screens2 „Hub — Verificarea la autentificare” → Codul din aplicație → div.scr-d, H 820
export default function HubTwoFactorVerifyGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Verificarea la autentificare (după parolă)"
      height={820}
      render={() => <HubTwoFactorVerifyFrame />}
    />
  );
}
