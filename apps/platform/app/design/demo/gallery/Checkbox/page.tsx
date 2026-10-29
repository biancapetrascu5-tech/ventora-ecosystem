/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Checkbox } from '@ventora/ui';
import { PvCell, PvFrames } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Frames({ Board }) → section.pv-frame Light → Board({ lang: "ro" })
const T = {
  l: [
    'Implicit · nebifat',
    'Bifat · cu descriere',
    'Hover',
    'Focus',
    'Apăsat',
    'Selecție parțială (antet „Selectează tot”)',
    'Eroare',
    'Dezactivat',
    'Dezactivat · bifat',
  ],
  off: 'Cere confirmarea programării',
  on: 'Trimite reamintire cu 24 de ore înainte',
  onD: 'Prin SMS și e-mail, către client.',
  hover: 'Afișează prețurile în pagina afacerii',
  focus: 'Mesaje despre facturile restante',
  pressed: 'Notificări pentru proprietar',
  ind: 'Toată echipa',
  err: 'Accept termenii și condițiile',
  errD: 'Bifează ca să continui.',
  dis: 'Exportă și fișele de prezență',
  disOn: 'Păstrează istoricul clientului',
};

function Board() {
  const L = T.l;
  return (
    <div className={f.pvGrid}>
      <PvCell label={L[0]!}>
        <Checkbox>{T.off}</Checkbox>
      </PvCell>
      <PvCell label={L[1]!}>
        <Checkbox description={T.onD} defaultSelected>
          {T.on}
        </Checkbox>
      </PvCell>
      <PvCell label={L[2]!}>
        <Checkbox state="hover">{T.hover}</Checkbox>
      </PvCell>
      <PvCell label={L[3]!}>
        <Checkbox state="focus" defaultSelected>
          {T.focus}
        </Checkbox>
      </PvCell>
      <PvCell label={L[4]!}>
        <Checkbox state="pressed">{T.pressed}</Checkbox>
      </PvCell>
      <PvCell label={L[5]!}>
        <Checkbox isIndeterminate>{T.ind}</Checkbox>
      </PvCell>
      <PvCell label={L[6]!}>
        <Checkbox isInvalid description={T.errD}>
          {T.err}
        </Checkbox>
      </PvCell>
      <PvCell label={L[7]!}>
        <Checkbox isDisabled>{T.dis}</Checkbox>
      </PvCell>
      <PvCell label={L[8]!}>
        <Checkbox isDisabled defaultSelected>
          {T.disOn}
        </Checkbox>
      </PvCell>
    </div>
  );
}

export default function CheckboxGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PvFrames render={() => <Board />} />;
}
