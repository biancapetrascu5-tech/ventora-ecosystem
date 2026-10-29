import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubTwoFactorSetupFrame } from './client';

// preview.html → Screens2 „Hub — Activarea…” → Pasul 1 · Codul QR și cheia → div.scr-d, H 1000
export default function HubTwoFactorSetupGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Activarea autentificării în doi pași"
      height={1000}
      render={() => <HubTwoFactorSetupFrame />}
    />
  );
}
