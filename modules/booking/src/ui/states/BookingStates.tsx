'use client';

import { useTranslations } from 'next-intl';
import { Button, Dialog, EmptyState, Notice } from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';

/* BookingStates: the states that complete the EasyBook screens, with the approved copy
   (booking.states.*), preview.html 1:1. The screens (Azi, Calendar, the list, the detail) draw
   them; the gallery draws them on its board. Props only. */

/** Azi · zi goală */
export function EmptyDay({ onAdd, onCalendar }: { onAdd?: () => void; onCalendar?: () => void }) {
  const t = useTranslations('booking.states');
  return (
    <EmptyState
      icon="calendar"
      title={t('emptyDay.title')}
      description={t('emptyDay.body')}
      actions={
        <>
          {onAdd && (
            <Button variant="primary" icon="plus" onPress={onAdd}>
              {t('emptyDay.add')}
            </Button>
          )}
          <Button icon="calendar" onPress={onCalendar}>
            {t('emptyDay.calendar')}
          </Button>
        </>
      }
    />
  );
}

/** Azi · „Au nevoie de tine”, goală */
export function NothingToDo() {
  const t = useTranslations('booking.states');
  return <EmptyState size="sm" icon="check-check" title={t('nothing')} />;
}

/** Azi · eroare la încărcare */
export function LoadError({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const t = useTranslations('booking.states');
  return (
    <Notice
      className={className}
      tone="danger"
      title={t('loadError.title')}
      actions={
        <Button size="sm" icon="rotate-ccw" onPress={onRetry}>
          {t('loadError.retry')}
        </Button>
      }
    >
      {t('loadError.body')}
    </Notice>
  );
}

/** Calendar · indiciu la prima folosire */
export function CalendarHint({
  onDismiss,
  className,
}: {
  onDismiss?: () => void;
  className?: string;
}) {
  const t = useTranslations('booking.states');
  return (
    <Notice
      className={className}
      tone="neutral"
      icon="info"
      title={t('hint.text')}
      actions={
        <Button size="sm" variant="quiet" onPress={onDismiss}>
          {t('hint.ok')}
        </Button>
      }
    />
  );
}

/** Listă · goală, cu filtre */
export function ListEmptyFiltered({ onClear }: { onClear?: () => void }) {
  const t = useTranslations('booking.states');
  return (
    <EmptyState
      size="sm"
      icon="list-filter"
      title={t('listFiltered.title')}
      actions={onClear ? <Button onPress={onClear}>{t('clearFilters')}</Button> : undefined}
    />
  );
}

/** Listă · goală de tot */
export function ListEmptyAll({ onAdd }: { onAdd?: () => void }) {
  const t = useTranslations('booking.states');
  return (
    <EmptyState
      size="sm"
      icon="calendar-check"
      title={t('listEmpty.title')}
      description={t('listEmpty.body')}
      actions={
        <Button variant="primary" icon="plus" onPress={onAdd}>
          {t('emptyDay.add')}
        </Button>
      }
    />
  );
}

/** Listă · rezultate în alte zile */
export function OtherDaysNotice({
  query,
  count,
  onShow,
  className,
}: {
  query: string;
  count: number;
  onShow?: () => void;
  className?: string;
}) {
  const t = useTranslations('booking.states');
  return (
    <Notice
      className={className}
      tone="neutral"
      icon="search"
      title={t('otherDays.title', { q: query })}
      actions={
        <Button size="sm" onPress={onShow}>
          {t('otherDays.action', { n: count })}
        </Button>
      }
    />
  );
}

type DialogCommon = { mode: ScreenMode; framed?: boolean; onClose?: () => void; busy?: boolean };

/** Listă · anulare în bloc; `notifies`: the client message is mentioned only when it is on. */
export function BulkCancelDialog(
  p: DialogCommon & { count: number; notifies?: boolean; onConfirm?: () => void },
) {
  const t = useTranslations('booking.states');
  return (
    <Dialog
      inline={p.framed}
      sheet={p.mode === 'mobile'}
      onClose={p.onClose}
      tone="danger"
      title={t('bulk.title', { n: p.count })}
      footer={
        <>
          <Button onPress={p.onClose}>{t('bulk.keep')}</Button>
          <Button variant="danger" onPress={p.onConfirm} isPending={p.busy}>
            {t('bulk.confirm')}
          </Button>
        </>
      }
    >
      {p.notifies ? <p className="body">{t('bulk.sms')}</p> : null}
    </Dialog>
  );
}

/** Setări · plecare fără salvare */
export function UnsavedDialog(p: DialogCommon & { onLeave?: () => void; onSave?: () => void }) {
  const t = useTranslations('booking.states');
  return (
    <Dialog
      inline={p.framed}
      sheet={p.mode === 'mobile'}
      onClose={p.onClose}
      title={t('unsaved.title')}
      footer={
        <>
          <Button onPress={p.onLeave}>{t('unsaved.leave')}</Button>
          <Button variant="primary" onPress={p.onSave} isPending={p.busy}>
            {t('unsaved.save')}
          </Button>
        </>
      }
    />
  );
}
