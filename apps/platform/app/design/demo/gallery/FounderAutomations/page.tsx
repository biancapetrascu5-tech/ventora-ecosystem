/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderAutomationsFrame } from './client';

// preview.html → „1 · Lista celor 6 automatizări v1” → Desktop · 1280, H 900 (Lotul 4.10, S116).
// Vederea e cea din @ventora/screens, ca în aplicația Founder; datele sunt exemplele din preview.
export default function FounderAutomationsGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="Founder — Automatizări (D4-23, D4-24)"
      height={900}
      render={() => <FounderAutomationsFrame />}
    />
  );
}
