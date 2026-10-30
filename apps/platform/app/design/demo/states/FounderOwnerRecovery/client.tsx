'use client';

import { RecoveryDone } from '@ventora/screens';
import s from '../../gallery/_shared/states.module.css';

// Drawer-ul de rezultat în cadrul lui (contained), ca în preview.
export function DoneBox({ variant }: { variant: 'A' | 'B' }) {
  return (
    <div className={s.contained}>
      <RecoveryDone
        contained
        businessName="Clinica Dentis Sibiu"
        ownerName="Andrei Mureșan"
        email="andrei@dentis.ro"
        variant={variant}
      />
    </div>
  );
}
