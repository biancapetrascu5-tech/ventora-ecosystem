import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubTeamInviteFrame } from './client';

// preview.html → Board „Hub — Echipă: „Invită o persoană” (S112)” → 1 · Membru, cu două
// aplicații → Desktop · 1280, H 900
export default function HubTeamInviteGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Hub — Echipă: „Invită o persoană” (S112)"
      height={900}
      render={() => <HubTeamInviteFrame />}
    />
  );
}
