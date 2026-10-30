/* eslint-disable i18next/no-literal-string */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { Frame } from './client';

// preview.html → 1 · Formularul (peste pagina afacerii) → 1280, H 860
export default function FounderSupportSessionGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="Founder — Sesiune de suport (Lotul 2.5c)"
      height={860}
      render={() => <Frame />}
    />
  );
}
