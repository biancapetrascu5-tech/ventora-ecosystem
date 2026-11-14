'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ManageStop } from '@ventora/booking/ui';
import { rememberLocale } from '@/i18n/locale';
import { useMode } from '../useMode';

/* BookingClientManage „Linkul nu mai e valabil” (S125 frame 10): an unknown, malformed or revoked
   link. Without a known business the page still answers the same, without its name. */
export function ManageInvalidScreen({
  slug,
  business,
}: {
  slug: string;
  business: { name: string; address: string } | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const mode = useMode();
  return (
    <ManageStop
      mode={mode}
      business={business ?? { name: '', address: '' }}
      lang={locale}
      onLang={(code) => {
        rememberLocale(code);
        router.refresh();
      }}
      kind="invalid"
      v={{}}
      onRebook={business ? () => router.push(`/r/${encodeURIComponent(slug)}`) : undefined}
    />
  );
}
