/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubAppActivationFrame } from './client';

// preview.html → „1 · Direct: implementarea, mentenanța proporțională și ce include” →
// Desktop · 1280, H 900.
export default function HubAppActivationGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Activarea unei aplicații la bucată: implementare o dată, mentenanță lunar (S117)"
      height={900}
      render={() => <HubAppActivationFrame />}
    />
  );
}
