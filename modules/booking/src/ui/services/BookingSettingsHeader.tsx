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
/**
 * B.14b: the tabs drawn in BookingMessageTemplates (S127): „Reamintiri” becomes „Mesaje”, „Trimitere
 * SMS” is gone, „Plăți și avans” and „Promoții” are added. Used by the Messages page; the older pages
 * keep the tabs of their designs (S123, S124) until the founder decides (NECESITĂ DECIZIE, raportul).
 */
export const SETTINGS_TABS_S127 = [
  'general',
  'services',
  'team',
  'resources',
  'messages',
  'online',
  'payments',
  'promo',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number] | (typeof SETTINGS_TABS_S127)[number];

export function BookingSettingsHeader({
  mode,
  tab = 'services',
  description,
  onTabChange,
  tabs = SETTINGS_TABS,
}: {
  mode: ScreenMode;
  tab?: SettingsTab;
  /** The tabs of the page's design (S127 for „Mesaje”). */
  tabs?: readonly SettingsTab[];
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
          items={tabs.map((id) => ({ id, label: t(`tabs.${id}`) }))}
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
  onUndo,
  undoLabel,
}: {
  mode: ScreenMode;
  tone?: 'done' | 'danger' | 'neutral';
  /** BookingStates: „↶ Anulează” after a quick action or a move. */
  onUndo?: () => void;
  undoLabel?: string;
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
        onUndo={onUndo}
        undoLabel={undoLabel}
      />
    </div>
  );
}

/** B.1-UI name of SettingsToast. */
export const ServicesToast = SettingsToast;
