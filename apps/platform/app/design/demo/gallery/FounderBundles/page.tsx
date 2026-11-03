/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderBundlesFrame } from '../_shared/founderBundles';

// preview.html (S117) → primul cadru: Desktop · 1280, H 1760. Design a redenumit FounderPlans în
// FounderBundles (P-S117-6), ca în cod.
export default function FounderBundlesGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="FounderBundles"
      height={1760}
      render={() => <FounderBundlesFrame />}
    />
  );
}
