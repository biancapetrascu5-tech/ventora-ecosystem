/* eslint-disable i18next/no-literal-string -- titlul cadrului din preview.html */
import { notFound } from 'next/navigation';
import { FounderInboxFrame, SupportFrames } from '../_shared/support';

// Lotul 4.6: cadrele light / dark pe toată lățimea ferestrei (1280 sau 390), ca preview.html.
export default function FounderSupportInboxGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <SupportFrames title="FounderSupportInbox — Deschise (Lotul 4.6)" height={900} founder>
      <FounderInboxFrame />
    </SupportFrames>
  );
}
