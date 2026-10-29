'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter } from 'next-intl';
import { openBusiness } from '@/server/session-actions';
import { ChooseBusinessView, useIsPhone, type BusinessRow } from '@ventora/screens';

/* „Deschide direct ultima afacere data viitoare” se păstrează per utilizator (Lot 2.6 · F) când
   deschide o afacere; „deschisă …” vine din ultima deschidere, în timpul relativ al limbii. */
export function ChooseBusinessScreen({
  userName,
  businesses,
  openLast,
}: {
  userName: string;
  businesses: (Omit<BusinessRow, 'last'> & { lastOpenedAt: string | null })[];
  openLast: boolean;
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const format = useFormatter();
  const [query, setQuery] = useState('');
  const [remember, setRemember] = useState(openLast);
  const now = new Date();
  return (
    <ChooseBusinessView
      userName={userName}
      businesses={businesses.map(({ lastOpenedAt, ...b }) => ({
        ...b,
        last: lastOpenedAt ? format.relativeTime(new Date(lastOpenedAt), now) : undefined,
      }))}
      query={query}
      onQueryChange={setQuery}
      remember={remember}
      onRememberChange={setRemember}
      focusFirst
      mob={phone}
      onOpen={async (id) => {
        if (await openBusiness(id, remember)) router.push('/');
      }}
    />
  );
}
