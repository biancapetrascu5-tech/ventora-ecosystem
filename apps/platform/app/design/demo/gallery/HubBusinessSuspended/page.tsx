import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubBusinessSuspendedFrame } from './client';

// preview.html → Board „Hub — afacere suspendată (S112)” → 1 · Singura afacere e oprită →
// Desktop · 1280, H 480
export default function HubBusinessSuspendedGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — afacere suspendată (S112)"
      height={480}
      render={() => <HubBusinessSuspendedFrame />}
    />
  );
}
