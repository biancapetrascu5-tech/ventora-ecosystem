import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { Frame } from './client';

// preview.html → „Founder — Parolă nouă” → 1 · „Ai uitat parola?” → 1280, H 820
export default function FounderPasswordResetGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames founder title="Founder — Parolă nouă" height={820} render={() => <Frame />} />
  );
}
