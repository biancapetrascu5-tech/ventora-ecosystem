'use client';

import { useState } from 'react';
import { ChooseBusinessView, type BusinessRow } from '@ventora/screens';

const BIZ: BusinessRow[] = [
  {
    id: 'aurora',
    name: 'Salon Aurora',
    role: 'Proprietar',
    apps: 7,
    last: 'azi, 09:12',
    recent: true,
  },
  { id: 'dentis', name: 'Clinica Dentis Sibiu', role: 'Recepție', apps: 3, last: 'ieri' },
  {
    id: 'nord',
    name: 'Agenția Nord Studio',
    role: 'Manager de proiect',
    apps: 4,
    last: 'acum 2 săptămâni',
  },
];

export function HubChooseBusinessFrame() {
  const [remember, setRemember] = useState(false);
  return (
    <ChooseBusinessView
      userName="Bianca Petrașcu"
      businesses={BIZ}
      remember={remember}
      onRememberChange={setRemember}
    />
  );
}
