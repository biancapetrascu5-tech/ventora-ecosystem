import { notFound } from 'next/navigation';
import { StateBoard } from '../../gallery/_shared/StateBoard';
import { SignInView } from '@ventora/screens';

const M = 'bianca@salonaurora.ro';

// HubSignIn (eroarea, din cadrul Telefon · Dark) + HubStates (se verifică, prea multe încercări, offline)
export default function HubSignInStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="HubSignIn · stări"
      boxes={() => [
        ['Implicit', <SignInView key="a" email={M} password="" remember={false} />],
        [
          'E-mail sau parolă greșite',
          <SignInView key="b" state="error" email={M} password="ventora2026" remember={false} />,
        ],
        [
          'Se verifică',
          <SignInView key="c" state="loading" email={M} password="ventora2026" remember={false} />,
        ],
        [
          'Prea multe încercări',
          <SignInView key="d" state="limit" email={M} password="" remember={false} />,
        ],
        [
          'Fără conexiune',
          <SignInView key="e" state="offline" email={M} password="" remember={false} />,
        ],
      ]}
    />
  );
}
