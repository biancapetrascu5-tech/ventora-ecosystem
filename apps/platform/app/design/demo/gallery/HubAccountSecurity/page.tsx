import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubAccountSecurityFrame } from './client';

// preview.html → Board „Hub — Contul tău · Securitate: «Schimbă parola»” → 1 · Se completează
// → Desktop · 1280, H 860
export default function HubAccountSecurityGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Contul tău · Securitate: „Schimbă parola” (S100, S108)"
      height={860}
      render={() => <HubAccountSecurityFrame />}
    />
  );
}
