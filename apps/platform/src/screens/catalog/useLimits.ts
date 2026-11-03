'use client';

import { useTranslations } from 'next-intl';

/* Limitele incluse într-un bundle sau într-o aplicație la bucată, ca text („1.500 de programări pe
   lună”, „5 GB spațiu pentru documente”), din cheile limits.* (design, 6 limbi). O limită fără
   text în Hub (alte chei decât programări, SMS, e-mailuri, campanii, spațiu) nu apare. Folosit de
   HubCatalogBundles (Lotul 3.4) și de HubCatalogApp (Lotul 3.7). */

const LIMIT_KEYS: Record<string, 'appointments' | 'sms' | 'emails' | 'campaigns'> = {
  'booking.appointments': 'appointments',
  'messaging.sms': 'sms',
  'messaging.email': 'emails',
  'marketing.campaigns': 'campaigns',
};
const STORAGE_KEY = 'documents.storage';

export function useLimits(): (quotas: Record<string, number | null>) => string[] {
  const lim = useTranslations('limits');
  return (quotas) =>
    Object.entries(quotas).flatMap(([key, value]) => {
      if (value === null) return [];
      if (key === STORAGE_KEY) return [lim('storage', { amount: `${value} GB` })];
      const k = LIMIT_KEYS[key];
      return k ? [lim(k, { count: value })] : [];
    });
}
