/* eslint-disable i18next/no-literal-string */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { Frame } from './client';

// preview.html → 1 · Formularul gol: butonul e inactiv (Drawer peste pagina afacerii) → 1280, H 1120
export default function FounderOwnerRecoveryGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="Founder — Recuperează accesul proprietarului (Lotul 2.5c)"
      height={1120}
      render={() => <Frame />}
    />
  );
}
