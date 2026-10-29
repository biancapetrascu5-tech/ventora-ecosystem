/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html */
'use client';

import { useState } from 'react';
import { EMPTY_RECOVERY, RecoveryDrawer, type RecoveryValues } from '@ventora/screens';
import { FounderBusinessDemo } from '../_shared/founderBusiness';
import { DEMO_OWNERS } from '../_shared/founder-data';
import b from '../_shared/founderBusiness.module.css';

export function Frame() {
  const [values, setValues] = useState<RecoveryValues>(EMPTY_RECOVERY);
  return (
    <div className={b.frame}>
      <div className={b.body}>
        <FounderBusinessDemo />
      </div>
      <RecoveryDrawer
        contained
        businessName="Clinica Dentis Sibiu"
        values={values}
        onChange={setValues}
        owners={DEMO_OWNERS}
      />
    </div>
  );
}
