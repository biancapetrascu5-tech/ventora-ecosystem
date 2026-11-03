/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubPlanBillingFrame } from './client';

// preview.html → „1 · Lunar: bundle + o aplicație la bucată” → Desktop · 1280, H 1100.
export default function HubPlanBillingGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Abonament și consum: ce plătește afacerea și cum (S113, S117)"
      height={1100}
      render={() => <HubPlanBillingFrame />}
    />
  );
}
