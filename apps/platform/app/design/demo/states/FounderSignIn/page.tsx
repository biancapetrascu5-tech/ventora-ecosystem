import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { FX_MAIL } from '../../gallery/_shared/founder-data';
import { FounderSignInView } from '@ventora/screens';

const PW = 'Founder2026!'; // gitleaks:allow — exemplul din preview.html

// preview.html → FounderSignIn: 2 · eroare, 3 · se verifică, 4 · prea multe încercări (S102)
export default function FounderSignInStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      founder
      title="FounderSignIn · stări"
      boxes={() => [
        ['1 · Formularul', <FounderSignInView key="1" email="" password="" />],
        [
          '2 · E-mailul sau parola nu sunt corecte',
          <FounderSignInView key="2" state="error" email={FX_MAIL} password={PW} />,
        ],
        [
          '3 · Se verifică',
          <FounderSignInView key="3" state="loading" email={FX_MAIL} password={PW} />,
        ],
        [
          '4 · Prea multe încercări',
          <FounderSignInView
            key="4"
            state="limit"
            email={FX_MAIL}
            password={PW}
            lockedTime="10:45"
          />,
        ],
        [
          'Fără conexiune',
          <FounderSignInView key="5" state="offline" email={FX_MAIL} password={PW} mob />,
        ],
      ]}
    />
  );
}
