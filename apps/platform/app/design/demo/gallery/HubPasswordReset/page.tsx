import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubPasswordResetFrame } from './client';

// preview.html → Screens2 „Hub — Parolă nouă” → 1 · „Ai uitat parola?” → div.scr-d light / dark, H 820
export default function HubPasswordResetGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Parolă nouă (din „Ai uitat parola?”)"
      height={820}
      render={() => <HubPasswordResetFrame />}
    />
  );
}
