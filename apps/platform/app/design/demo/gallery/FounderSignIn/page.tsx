import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { Frame } from './client';

// preview.html → „Founder — Intrarea în Founder Control Center” → 1 · Formularul → 1280, H 820
export default function FounderSignInGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="Founder — Intrarea în Founder Control Center"
      height={820}
      render={() => <Frame />}
    />
  );
}
