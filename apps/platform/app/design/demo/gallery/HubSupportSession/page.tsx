/* eslint-disable i18next/no-literal-string */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubSupportSessionFrame } from './client';

// preview.html → Board2 „Hub — Sesiune de suport activă” → 1 · Launcher · proprietar → 1280, H 820
export default function HubSupportSessionGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Sesiune de suport activă (Lotul 2.5c)"
      height={820}
      render={() => <HubSupportSessionFrame />}
    />
  );
}
