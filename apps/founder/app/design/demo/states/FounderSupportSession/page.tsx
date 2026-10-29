import { notFound } from 'next/navigation';
import { StateBoard } from '../../_shared/StateBoard';
import { DEMO_ORG } from '../../_shared/demo-data';
import {
  CloseFounderSupportDialog,
  FounderSupportBanner,
  FounderSupportClosedToast,
  OpenSupportDialog,
} from '@/screens/support/FounderSupportView';

const R = 'Programările de joi nu apar în calendar; verific setările EasyBook.';
const T = 'VS-2026-0142';

// preview.html → Board2 1–8 (fără pagina afacerii din fundal)
export default function FounderSupportSessionStates() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <StateBoard
      title="FounderSupportSession · stări"
      column={1040}
      boxes={() => [
        [
          '1 · Formularul',
          <OpenSupportDialog key="1" inline reason={R} ticket={T} duration="60" />,
          true,
        ],
        [
          '2 · Câmpuri lipsă',
          <OpenSupportDialog key="2" inline state="errors" reason="" ticket="" duration="60" />,
          true,
        ],
        [
          '3 · Există deja o sesiune (cine și până când: API-ul nu le dă, NECESITĂ DECIZIE)',
          <OpenSupportDialog
            key="3"
            inline
            state="exists"
            reason={R}
            ticket={T}
            duration="60"
            existing={{ founderName: 'Mihai Ionescu', expiresAt: '16:30' }}
          />,
          true,
        ],
        [
          '4 · Se deschide',
          <OpenSupportDialog key="4" inline state="loading" reason={R} ticket={T} duration="60" />,
          true,
        ],
        ['5 · În sesiune: bannerul peach', <FounderSupportBanner key="5" {...DEMO_ORG} />, true],
        [
          '5b · Bannerul pe telefon',
          <div key="5b" style={{ width: 390 }}>
            <FounderSupportBanner {...DEMO_ORG} mob />
          </div>,
          true,
        ],
        [
          '6 · Închide: confirmarea',
          <CloseFounderSupportDialog key="6" inline organizationName={DEMO_ORG.organizationName} />,
          true,
        ],
        [
          '7 · Închisă: toastul',
          <div key="7" style={{ width: 360 }}>
            <FounderSupportClosedToast />
          </div>,
          true,
        ],
        [
          '8 · Expirată: bannerul neutru',
          <FounderSupportBanner key="8" {...DEMO_ORG} expired />,
          true,
        ],
      ]}
    />
  );
}
