/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubCatalogBundlesFrame } from './client';

// preview.html (S117) → primul cadru: Desktop · 1280, H 1200.
export default function HubCatalogBundlesGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="HubCatalogBundles"
      height={1200}
      render={() => <HubCatalogBundlesFrame />}
    />
  );
}
