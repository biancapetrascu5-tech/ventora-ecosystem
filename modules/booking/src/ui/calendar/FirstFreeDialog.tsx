'use client';

import { Button, Dialog, FormField, Select } from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { useCalendarTexts } from './calendar-texts';

/* BookingCalendar (B.6a): „Primul loc liber” asks for the service first (README: „jumps to the next
   free slot for the chosen service”). The design draws only the result (the Notice); this Dialog
   is the smallest way to choose the service, built only from the system's components. */

export type FirstFreeDialogProps = {
  mode: ScreenMode;
  services: { value: string; label: string; description?: string }[];
  serviceId?: string;
  onServiceChange?: (id: string) => void;
  onSearch?: () => void;
  onCancel?: () => void;
  busy?: boolean;
};

export function FirstFreeDialog(p: FirstFreeDialogProps) {
  const { t } = useCalendarTexts();
  return (
    <Dialog
      sheet={p.mode === 'mobile'}
      onClose={p.onCancel}
      closeLabel={t('ff.cancel')}
      title={t('ff.pickTitle')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onCancel}>
            {t('ff.cancel')}
          </Button>
          <Button
            variant="primary"
            icon="search"
            onPress={p.onSearch}
            isPending={p.busy}
            isDisabled={!p.serviceId}
          >
            {t('ff.search')}
          </Button>
        </>
      }
    >
      <FormField label={t('ff.pickLabel')} required>
        <Select
          aria-label={t('ff.pickLabel')}
          value={p.serviceId}
          onChange={p.onServiceChange}
          options={p.services}
        />
      </FormField>
    </Dialog>
  );
}
