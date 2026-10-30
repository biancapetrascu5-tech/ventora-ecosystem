import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { ResetDone, ResetNewPassword, ResetRequest, ResetSent } from '@ventora/screens';

const MAIL = 'bianca@salonaurora.ro';

// preview.html → StateBoard „Stări · desktop” (1–16), cu aceleași date
export default function HubPasswordResetStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="HubPasswordReset · stări"
      boxes={() => [
        ['1 · E-mail lipsă', <ResetRequest key="1" state="empty" email="" />],
        [
          '2 · Adresă incompletă',
          <ResetRequest key="2" state="format" email="bianca@salonaurora" />,
        ],
        ['3 · Se trimite', <ResetRequest key="3" state="loading" email={MAIL} />],
        [
          '4 · Prea multe cereri, cu ora',
          <ResetRequest key="4" state="limit" email={MAIL} limitTime="10:45" />,
        ],
        ['5 · Fără conexiune', <ResetRequest key="5" state="offline" email={MAIL} />],
        ['6 · După un minut: „Trimite alt link”', <ResetSent key="6" state="ready" email={MAIL} />],
        ['7 · Alt link trimis', <ResetSent key="7" state="resent" email={MAIL} />],
        ['8 · Parolă nouă · câmp gol', <ResetNewPassword key="8" password="" email={MAIL} />],
        [
          '9 · Toate cerințele bifate',
          <ResetNewPassword key="9" password="Aurora2026!" email={MAIL} />,
        ],
        [
          '10 · „Salvează parola” cu cerințe lipsă',
          <ResetNewPassword key="10" state="error" password="aurora2026" email={MAIL} />,
        ],
        [
          '11 · Se salvează',
          <ResetNewPassword key="11" state="loading" password="Aurora2026!" email={MAIL} />,
        ],
        ['12 · Linkul a expirat', <ResetNewPassword key="12" state="expired" password="" />],
        ['13 · Linkul a fost deja folosit', <ResetNewPassword key="13" state="used" password="" />],
        ['14 · Parola e schimbată · fără 2FA (membru)', <ResetDone key="14" twoStep={false} />],
        ['14b · Parola e schimbată · proprietar cu 2FA', <ResetDone key="14b" twoStep />],
        [
          '15 · Link expirat → „Cere un link nou”: alt link pe adresa contului (fără adresă: API-ul nu o întoarce)',
          <ResetSent key="15" />,
        ],
        [
          '16 · Link deja folosit → „Cere un link nou”: câmpul e gol',
          <ResetRequest key="16" email="" />,
        ],
      ]}
    />
  );
}
