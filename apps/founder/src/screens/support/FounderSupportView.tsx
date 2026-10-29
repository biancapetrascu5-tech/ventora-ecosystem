'use client';

import type { FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Dialog,
  FormField,
  Icon,
  Input,
  Notice,
  Select,
  Textarea,
  Toast,
  cn,
} from '@ventora/ui';
import { thousands } from '@/lib/fmt';
import styles from './support.module.css';

/* FounderSupportSession (Lotul 2.5c, S86, S90, S92, S93, S98): formularul de deschidere,
   bannerul peach cât ține sesiunea, închiderea, expirarea. Doar română (S57). */

export const REASON_MIN = 10;
export const REASON_MAX = 1000;
export const TICKET_MAX = 255;
export const DURATIONS = ['30', '60', '120', '240'] as const;

export type OpenFormState = 'idle' | 'errors' | 'exists' | 'loading';

export function OpenSupportDialog({
  state = 'idle',
  reason,
  ticket,
  duration,
  onReasonChange,
  onTicketChange,
  onDurationChange,
  existing,
  inline,
  mob,
  onCancel,
  onSubmit,
}: {
  state?: OpenFormState;
  reason: string;
  ticket: string;
  duration: string;
  onReasonChange?: (v: string) => void;
  onTicketChange?: (v: string) => void;
  onDurationChange?: (v: string) => void;
  /** Sesiunea deja deschisă (pentru „există deja”); API-ul nu o întoarce încă. */
  existing?: { founderName: string; expiresAt: string };
  inline?: boolean;
  mob?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
}) {
  const t = useTranslations('founder.support.open');
  const ui = useTranslations('ui');
  const errs = state === 'errors';
  const reasonErr = errs && reason.trim().length < REASON_MIN;
  const ticketErr = errs && !ticket.trim();
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      size="wide"
      title={t('title')}
      description={t('lead')}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            icon="eye"
            isPending={state === 'loading'}
            isDisabled={state === 'exists'}
            onPress={onSubmit}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        {state === 'exists' && (
          <Notice tone="danger" title={t('existsTitle')}>
            {existing ? t('existsBody', existing) : null}
          </Notice>
        )}
        <FormField
          label={t('reason')}
          isRequired
          requiredLabel={ui('required')}
          hint={reasonErr ? undefined : t('reasonHelp')}
          error={reasonErr ? t('reasonError') : undefined}
          counter={`${thousands(reason.length)} / ${thousands(REASON_MAX)}`}
        >
          {(field) => (
            <Textarea
              {...field}
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => onReasonChange?.(e.target.value)}
              isInvalid={reasonErr}
            />
          )}
        </FormField>
        <FormField
          label={t('ticket')}
          isRequired
          requiredLabel={ui('required')}
          hint={ticketErr ? undefined : t('ticketHelp')}
          error={ticketErr ? t('ticketError') : undefined}
        >
          {(field) => (
            <Input
              {...field}
              maxLength={TICKET_MAX}
              value={ticket}
              onChange={(e) => onTicketChange?.(e.target.value)}
              isInvalid={ticketErr}
            />
          )}
        </FormField>
        <FormField
          label={t('duration')}
          isOptional
          optionalLabel={ui('optional')}
          hint={t('durationHelp')}
        >
          {(field) => (
            <Select
              id={field.id}
              aria-describedby={field['aria-describedby']}
              value={duration}
              onChange={onDurationChange}
              options={DURATIONS.map((d) => ({ value: d, label: t(`duration${d}`) }))}
            />
          )}
        </FormField>
      </form>
    </Dialog>
  );
}

/** Bannerul peach (S90: ești acum în datele altei afaceri) sau neutru, după expirare. */
export function FounderSupportBanner({
  organizationName,
  expiresAt,
  expired,
  mob,
  onClose,
  onOpenNew,
}: {
  organizationName: string;
  expiresAt?: string;
  expired?: boolean;
  mob?: boolean;
  onClose?: () => void;
  onOpenNew?: () => void;
}) {
  const t = useTranslations('founder.support');
  if (expired) {
    const act = (
      <Button size="sm" icon="eye" onPress={onOpenNew}>
        {t('open.action')}
      </Button>
    );
    return (
      <div className={cn(styles.bar, mob && styles.barMob)} role="status">
        <Icon icon="clock" size={20} />
        <div className={styles.txt}>
          <p className="body-small">{t('banner.expired')}</p>
          {mob && <div className={styles.act}>{act}</div>}
        </div>
        {!mob && act}
      </div>
    );
  }
  const close = (
    <Button size="sm" icon="x" onPress={onClose}>
      {t('banner.close')}
    </Button>
  );
  return (
    <div className={cn(styles.bar, styles.attention, mob && styles.barMob)} role="status">
      <Icon icon="eye" size={20} />
      <div className={styles.txt}>
        <p className="body-strong">{t('banner.title', { organizationName })}</p>
        <p className="body-small">
          {t('banner.expires', { expiresAt: expiresAt ?? '' })} ·{' '}
          <span className={styles.meta}>{t('banner.readOnly')}</span>
        </p>
        {mob && <div className={styles.act}>{close}</div>}
      </div>
      {!mob && close}
    </div>
  );
}

export function CloseFounderSupportDialog({
  organizationName,
  inline,
  mob,
  pending,
  onCancel,
  onConfirm,
}: {
  organizationName: string;
  inline?: boolean;
  mob?: boolean;
  pending?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
}) {
  const t = useTranslations('founder.support');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('banner.closeConfirm', { organizationName })}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" onPress={onCancel}>
            {t('open.cancel')}
          </Button>
          <Button variant="primary" icon="x" isPending={pending} onPress={onConfirm}>
            {t('banner.close')}
          </Button>
        </>
      }
    >
      <p className="body muted">{t('banner.readOnly')}</p>
    </Dialog>
  );
}

export function FounderSupportClosedToast({ onDismiss }: { onDismiss?: () => void }) {
  const t = useTranslations('founder.support.banner');
  const ui = useTranslations('ui');
  return (
    <Toast tone="neutral" title={t('closed')} onDismiss={onDismiss} dismissLabel={ui('close')} />
  );
}
