import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { HubInviteFrame } from './client';

// preview.html → Screens „Acceptarea invitației și setarea parolei” → Desktop · 1280, H 860
export default function HubInviteGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      title="Acceptarea invitației și setarea parolei"
      height={860}
      render={() => <HubInviteFrame />}
    />
  );
}
