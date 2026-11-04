/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubAutomationsFrame } from './client';

// preview.html → „1 · Proprietar: lista, cu consumul la 82%” → Desktop · 1280, H 1500 (Lotul 4.10).
export default function HubAutomationsGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Automatizări (D4-23, D4-24)"
      height={1500}
      render={() => <HubAutomationsFrame />}
    />
  );
}
