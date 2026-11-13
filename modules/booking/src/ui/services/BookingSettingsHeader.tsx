'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, Tabs, Toast } from '@ventora/ui';
import type { ScreenMode } from './BookingServicesView';
import s from './services.module.css';

/* EasyBook · Setări (BookingSettings / BookingServices, S123; BookingTeamSchedule, S124): the page
   header with the tabs. „Servicii” and „Programul echipei” have screens; the other tabs open their
   routes (404 until their lots, S123-9). */

export const SETTINGS_TABS = [
  'general',
  'services',
  'team',
  'resources',
  'reminders',
  'sms',
  'online',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function BookingSettingsHeader({
  mode,
  tab = 'services',
  description,
  onTabChange,
}: {
  mode: ScreenMode;
  tab?: SettingsTab;
  /** The lead of the tab (hidden on a phone); „Servicii” by default. */
  description?: string;
  onTabChange?: (tab: SettingsTab) => void;
}) {
  const t = useTranslations('booking.settings');
  const services = useTranslations('booking.services');
  return (
    <PageHeader
      title={t('title')}
      description={mode === 'mobile' ? undefined : (description ?? services('lead'))}
      tabs={
        <Tabs
          label={t('tabs.label')}
          selectedKey={tab}
          onSelectionChange={(k) => onTabChange?.(k as SettingsTab)}
          items={SETTINGS_TABS.map((id) => ({ id, label: t(`tabs.${id}`) }))}
        />
      }
    />
  );
}

/** A confirmation toast: inside the frame in the gallery, fixed in the window in the application. */
export function SettingsToast({
  mode,
  tone = 'done',
  title,
  description,
  framed,
  onDismiss,
  dismissLabel,
  action,
}: {
  mode: ScreenMode;
  tone?: 'done' | 'danger';
  /** A button in the Toast („Anulează” after a quick action, BookingToday). */
  action?: { label: string; onClick: () => void };
  title: string;
  description?: string;
  framed?: boolean;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div className={`${s.toast} ${mode === 'mobile' ? s.m : ''} ${framed ? '' : s.toastFixed}`}>
      <Toast
        tone={tone}
        title={title}
        description={description}
        onDismiss={onDismiss}
        dismissLabel={dismissLabel}
        action={action}
      />
    </div>
  );
}

/** B.1-UI name of SettingsToast. */
export const ServicesToast = SettingsToast;
