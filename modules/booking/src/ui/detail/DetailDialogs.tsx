'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Button,
  DatePicker,
  Dialog,
  FormField,
  Notice,
  SlotPicker,
  Textarea,
  type SlotItem,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { isoDay, pickerDay } from '../new/new-format';
import { STATUS_LOOK } from './detail-format';
import s from './detail.module.css';

/* The dialogs of the detail. „Anulezi programarea?” is BookingStates („Detaliu · anularea unei
   programări”), 1:1; the client message is mentioned only when the business has the notification
   on (`notifies`). „Mută programarea” and „Corectează starea” are not drawn (D-B4: the same member
   and service, a new day and time; S116-D9: „Încheiată” ↔ „Nu a venit” with a reason) and are
   built from the same components. Plain Dialogs: the page puts them in a DialogTrigger; `framed`
   draws them inline (gallery). On a phone a dialog is a bottom sheet. */

type Common = { mode: ScreenMode; framed?: boolean; onClose?: () => void; busy?: boolean };
const common = (p: Common) => ({
  inline: p.framed,
  sheet: p.mode === 'mobile',
  onClose: p.onClose,
});

export function CancelAppointmentDialog(
  p: Common & {
    client: string;
    /** „vineri, 23 octombrie” */
    day: string;
    time: string;
    /** The business sends the client a message on cancellation (BookingSms*). */
    notifies?: boolean;
    onConfirm?: () => void;
  },
) {
  const t = useTranslations('booking');
  return (
    <Dialog
      {...common(p)}
      tone="danger"
      title={t('detail.cancel.title')}
      footer={
        <>
          <Button onPress={p.onClose}>{t('detail.cancel.keep')}</Button>
          <Button variant="danger" onPress={p.onConfirm} isPending={p.busy}>
            {t('action.cancel')}
          </Button>
        </>
      }
    >
      <p className={`body ${s.flat}`}>
        {t('detail.cancel.what', { client: p.client, day: p.day, time: p.time })}
      </p>
    </Dialog>
  );
}

export function MoveAppointmentDialog(
  p: Common & {
    date: string;
    today: string;
    closedWeekdays?: number[];
    onDate?: (date: string) => void;
    /** The free times of that day for the same person and service; null while they are read. */
    slots: SlotItem[] | null;
    time: string | null;
    onTime?: (time: string) => void;
    error?: string | null;
    onConfirm?: () => void;
  },
) {
  const t = useTranslations('booking');
  const locale = useLocale();
  return (
    <Dialog
      {...common(p)}
      title={t('detail.move.title')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onClose}>
            {t('new.cancel')}
          </Button>
          <Button
            variant="primary"
            icon="calendar"
            onPress={p.onConfirm}
            isPending={p.busy}
            isDisabled={!p.time}
          >
            {t('detail.move.save')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {p.error && <Notice className={s.notice} tone="attention" title={p.error} />}
        <FormField label={t('new.date')} required>
          <DatePicker
            value={pickerDay(p.date)}
            today={pickerDay(p.today)}
            min={pickerDay(p.today)}
            locale={locale}
            isDisabled={(d) => (p.closedWeekdays ?? []).includes(((d.getDay() + 6) % 7) + 1)}
            onChange={(v) => v instanceof Date && p.onDate?.(isoDay(v))}
          />
        </FormField>
        <FormField
          label={t('new.start.label')}
          required
          hint={p.slots && p.slots.length === 0 ? t('new.start.none') : undefined}
        >
          <div>
            <SlotPicker
              label={t('new.start.label')}
              slots={p.slots ?? []}
              value={p.time ?? undefined}
              onChange={p.onTime}
            />
          </div>
        </FormField>
      </div>
    </Dialog>
  );
}

export function CorrectStatusDialog(
  p: Common & {
    /** The state it becomes (S116-D9: completed ↔ no_show). */
    to: 'completed' | 'no_show';
    reason: string;
    onReason?: (v: string) => void;
    error?: string | null;
    onConfirm?: () => void;
  },
) {
  const t = useTranslations('booking');
  const look = STATUS_LOOK[p.to];
  return (
    <Dialog
      {...common(p)}
      title={t('detail.correct.title')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onClose}>
            {t('new.cancel')}
          </Button>
          <Button variant="primary" onPress={p.onConfirm} isPending={p.busy}>
            {t('detail.correct.save')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        <FormField label={t('detail.correct.to')}>
          <p className={`body ${s.flat}`}>{t(`status.${look.key}`)}</p>
        </FormField>
        <FormField
          label={t('detail.correct.reason')}
          required
          hint={t('detail.correct.reasonHelp')}
          error={p.error ?? undefined}
        >
          <Textarea
            rows={3}
            maxLength={500}
            value={p.reason}
            isInvalid={!!p.error}
            onChange={(e) => p.onReason?.(e.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
