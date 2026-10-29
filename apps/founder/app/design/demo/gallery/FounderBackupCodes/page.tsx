import { notFound } from 'next/navigation';
import { DesktopFrames } from '../../_shared/ScreenFrames';
import { Frame } from './client';

// preview.html → 1 · Codurile rămase → 1280, H 760
export default function FounderBackupCodesGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames title="Founder — Coduri de rezervă" height={760} render={() => <Frame />} />
  );
}
