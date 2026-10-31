/* eslint-disable i18next/no-literal-string -- „Mai multe” din preview.html */
import { notFound } from 'next/navigation';
import { DesktopFrames } from '../_shared/ScreenFrames';
import { FounderBusinessDemo } from '../_shared/founderBusiness';

// preview.html → „Founder — O afacere: consum, excepții, abonament, proprietar și jurnal”
// → Desktop · 1280, H 1100. Partea comercială e din design (Lotul 3.4); antetul, fișa
// proprietarului și „Ultimele modificări” sunt BusinessView, ca în aplicația Founder.
export default function FounderBusinessGallery() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <DesktopFrames
      founder
      title="Founder — O afacere: consum, excepții, abonament, proprietar și jurnal"
      height={1100}
      render={() => (
        <FounderBusinessDemo
          menu={[
            { id: 'move', label: 'Mută pe altă versiune', icon: 'arrow-right' },
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
