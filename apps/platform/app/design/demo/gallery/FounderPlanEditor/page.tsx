/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderBundleEditorFrame } from '../_shared/founderBundles';

// preview.html (S117) → primul cadru: Desktop · 1280, H 1960. În cod, ecranul e FounderBundles
// (decizia fondatoarei); numele componentei din design rămâne până îl aliniază Design.
export default function FounderPlanEditorGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="FounderPlanEditor"
      height={1960}
      render={() => <FounderBundleEditorFrame />}
    />
  );
}
