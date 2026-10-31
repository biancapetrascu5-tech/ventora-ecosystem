/* eslint-disable i18next/no-literal-string -- „Mai multe acțiuni” din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderBusinessDemo } from '../_shared/founderBusiness';

// preview.html → „1 · Activă: acțiunile din antet, pe telefon sub titlu” → Desktop · 1280, H 900
// (S112). Antetul (acțiunea principală + „Mai multe acțiuni”), fișa proprietarului și „Ultimele
// modificări” sunt BusinessView, ca în aplicația Founder; partea comercială e din design (3.4).
export default function FounderBusinessActionsGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="Founder — O afacere: acțiunile pe telefon, suspendată, „Reactivează afacerea” (S112)"
      height={900}
      render={() => (
        <FounderBusinessDemo
          copy="s112"
          menu={[
            { id: 'support', label: 'Deschide o sesiune de suport', icon: 'eye' },
            { id: 'recovery', label: 'Recuperează accesul proprietarului', icon: 'key-round' },
            {
              id: 'move',
              label: 'Mută pe altă versiune',
              icon: 'arrow-right-left',
              separatorBefore: true,
            },
            { id: 'resend', label: 'Retrimite invitația proprietarului', icon: 'send' },
            {
              id: 'suspend',
              label: 'Suspendă afacerea',
              icon: 'lock',
              danger: true,
              separatorBefore: true,
            },
          ]}
        />
      )}
    />
  );
}
