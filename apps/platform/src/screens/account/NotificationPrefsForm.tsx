'use client';

import { useState } from 'react';
import { saveNotificationPreference } from '@/server/notification-actions';
import {
  NotificationPrefs,
  type NotificationPrefsValue,
  type PrefChange,
} from './NotificationPrefsView';

/* Lot 4.4: preferințele legate de livrarea din 4.3. Comutatorul se schimbă imediat; dacă
   salvarea nu reușește, revine. Rândurile fixe (securitatea, în aplicație) n-au comutator. */

function apply(v: NotificationPrefsValue, c: PrefChange, on: boolean): NotificationPrefsValue {
  if (c.channel === 'email' && c.topic !== 'news')
    return { ...v, email: { ...v.email, [c.topic]: on } };
  if (c.topic === 'recommendations') return { ...v, recommendations: { inApp: on } };
  return { ...v, news: { ...v.news, [c.channel === 'email' ? 'email' : 'inApp']: on } };
}

export function NotificationPrefsForm({
  initial,
  mob,
  onSaved,
}: {
  initial: NotificationPrefsValue;
  mob?: boolean;
  onSaved?: (ok: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NotificationPrefs
      mob={mob}
      value={value}
      onChange={async (change, enabled) => {
        setValue((v) => apply(v, change, enabled));
        const ok = await saveNotificationPreference(change.topic, change.channel, enabled);
        if (!ok) setValue((v) => apply(v, change, !enabled));
        onSaved?.(ok);
      }}
    />
  );
}
