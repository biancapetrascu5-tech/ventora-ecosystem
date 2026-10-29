import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { FX_MAIL } from '../../gallery/_shared/founder-data';
import { ResetDone, ResetNewPassword, ResetRequest, ResetSent } from '@ventora/screens';

// preview.html → Founder: ecranele 2–4, apoi pe telefon: prea multe cereri, cerințe lipsă,
// link expirat, link folosit, se salvează
export default function FounderPasswordResetStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      founder
      title="FounderPasswordReset · stări"
      boxes={() => [
        ['2 · Linkul e trimis', <ResetSent key="2" email={FX_MAIL} />],
        [
          '3 · Alege o parolă nouă',
          <ResetNewPassword key="3" password="aurora2026" email={FX_MAIL} />,
        ],
        ['4 · Parola e schimbată (2FA obligatorie, S58)', <ResetDone key="4" twoStep />],
        [
          'Prea multe cereri',
          <ResetRequest key="5" state="limit" email={FX_MAIL} limitTime="10:45" mob />,
        ],
        [
          'Cerințe lipsă',
          <ResetNewPassword key="6" state="error" password="aurora2026" email={FX_MAIL} mob />,
        ],
        ['Linkul a expirat', <ResetNewPassword key="7" state="expired" password="" mob />],
        ['Linkul a fost deja folosit', <ResetNewPassword key="8" state="used" password="" mob />],
        [
          'Se salvează',
          <ResetNewPassword key="9" state="loading" password="Aurora2026!" email={FX_MAIL} mob />,
        ],
      ]}
    />
  );
}
