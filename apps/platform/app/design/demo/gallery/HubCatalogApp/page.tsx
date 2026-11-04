/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubCatalogAppFrame } from './client';

// preview.html → „Hub — Pagina unei aplicații din catalog” → Desktop · 1280, H 900.
export default function HubCatalogAppGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Pagina unei aplicații din catalog"
      height={900}
      render={() => <HubCatalogAppFrame />}
    />
  );
}
