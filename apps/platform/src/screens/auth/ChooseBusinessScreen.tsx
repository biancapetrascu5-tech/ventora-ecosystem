'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { openBusiness } from '@/server/session-actions';
import { ChooseBusinessView, type BusinessRow } from './ChooseBusinessView';
import { useIsPhone } from './hooks';

/* „Deschide direct ultima afacere data viitoare”: nu există încă o preferință salvată pe server
   pentru asta (NECESITĂ DECIZIE); bifa se vede, dar nu se păstrează. */
export function ChooseBusinessScreen({
  userName,
  businesses,
}: {
  userName: string;
  businesses: BusinessRow[];
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const [query, setQuery] = useState('');
  const [remember, setRemember] = useState(false);
  return (
    <ChooseBusinessView
      userName={userName}
      businesses={businesses}
      query={query}
      onQueryChange={setQuery}
      remember={remember}
      onRememberChange={setRemember}
      focusFirst
      mob={phone}
      onOpen={async (id) => {
        if (await openBusiness(id)) router.push('/');
      }}
    />
  );
}
