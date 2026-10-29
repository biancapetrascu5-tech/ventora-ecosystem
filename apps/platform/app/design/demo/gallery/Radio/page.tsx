/* eslint-disable i18next/no-literal-string */
'use client';
import { notFound } from 'next/navigation';
import { Radio, RadioGroup, type ForcedState } from '@ventora/ui';
import { ThPair } from '../_shared/QPair';
import f from '../_shared/frames.module.css';

// preview.html → Extra → Frames({ States }) → ThemeFrame light → RG(R_RO)
const T = {
  legend: 'Cum confirmăm programarea?',
  helper: 'Clientul primește confirmarea imediat după ce salvezi.',
  smsD: 'Ajunge în câteva secunde.',
  email: 'Email',
  none: 'Nu trimite confirmare',
  waD: 'Nu e în abonament.',
  dur: 'Durata ședinței',
  durE: 'Alege o durată.',
  loc: 'Locația',
  loc1: 'Sibiu, Piața Mică',
  loc2: 'Brașov, Str. Mureșenilor',
  s: ['Neselectat', 'Selectat', 'Apăsat', 'Dezactivat', 'Dezactivat, selectat', 'Cu eroare'],
};

/* În bundle, Radio poate sta singur; în react-aria are nevoie de un grup, deci fiecare
   exemplu din rândul de stări are grupul lui, fără etichetă vizibilă. */
function Solo({
  label,
  checked,
  state,
  disabled,
  invalid,
}: {
  label: string;
  checked?: boolean;
  state?: ForcedState;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <RadioGroup aria-label={label} value={checked ? 'x' : null} isDisabled={disabled}>
      <Radio value="x" state={state} isInvalid={invalid}>
        {label}
      </Radio>
    </RadioGroup>
  );
}

function RG() {
  return (
    <div className={f.d0}>
      <RadioGroup label={T.legend} isRequired defaultValue="sms" hint={T.helper}>
        <Radio value="sms" description={T.smsD}>
          SMS
        </Radio>
        <Radio value="email">{T.email}</Radio>
        <Radio value="none">{T.none}</Radio>
        <Radio value="wa" isDisabled description={T.waD}>
          WhatsApp
        </Radio>
      </RadioGroup>
      <RadioGroup label={T.dur} orientation="horizontal" error={T.durE}>
        <Radio value="30">30 min</Radio>
        <Radio value="60">60 min</Radio>
        <Radio value="90">90 min</Radio>
      </RadioGroup>
      <RadioGroup label={T.loc} isDisabled defaultValue="c">
        <Radio value="c">{T.loc1}</Radio>
        <Radio value="b">{T.loc2}</Radio>
      </RadioGroup>
      <div className={f.r}>
        <Solo label={T.s[0]!} />
        <Solo label={T.s[1]!} checked />
        <Solo label="Hover" state="hover" />
        <Solo label="Focus" state="focus" checked />
        <Solo label={T.s[2]!} state="pressed" />
        <Solo label={T.s[3]!} disabled />
        <Solo label={T.s[4]!} disabled checked />
        <Solo label={T.s[5]!} invalid />
      </div>
    </div>
  );
}

export default function RadioGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ThPair as="div" titleClass="heading" min={420} render={() => <RG />} />;
}
