/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubCatalogFrame } from './client';

// preview.html → „Hub — Catalogul aplicațiilor: toate cele 15, pe categorii, cu căutare” →
// Desktop · 1280, H 1180.
export default function HubCatalogGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Catalogul aplicațiilor: toate cele 15, pe categorii, cu căutare"
      height={1180}
      render={() => <HubCatalogFrame />}
    />
  );
}
