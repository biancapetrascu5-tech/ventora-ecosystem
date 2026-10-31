'use client';

import { useRouter } from 'next/navigation';
import { SuspendedBusinessView, authApi, useIsPhone } from '@ventora/screens';

/* HubBusinessSuspended (S112): „Ieși din cont” închide sesiunea și duce la intrare. */
export function BusinessSuspendedScreen({
  userName,
  business,
  supportEmail,
}: {
  userName: string;
  business: string;
  supportEmail: string;
}) {
  const router = useRouter();
  const phone = useIsPhone();
  return (
    <SuspendedBusinessView
      userName={userName}
      business={business}
      supportEmail={supportEmail}
      mob={phone}
      onSignOut={async () => {
        await authApi.signOut();
        router.replace('/sign-in');
      }}
    />
  );
}
