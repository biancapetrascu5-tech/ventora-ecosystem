/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubAddonPurchaseFrame } from './client';

// preview.html → primul cadru: Desktop · 1280, H 860 (cumpărarea unui pachet în plus).
export default function HubAddonPurchaseGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Cumpărarea unui pachet în plus"
      height={860}
      render={() => <HubAddonPurchaseFrame />}
    />
  );
}
