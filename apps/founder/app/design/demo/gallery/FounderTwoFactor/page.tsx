import { notFound } from 'next/navigation';
import { DesktopFrames } from '../../_shared/ScreenFrames';
import { Frame } from './client';

// preview.html → Founder — activarea, pasul 1 → 1280, H 1000
export default function FounderTwoFactorGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Founder — Autentificarea în doi pași"
      height={1000}
      render={() => <Frame />}
    />
  );
}
