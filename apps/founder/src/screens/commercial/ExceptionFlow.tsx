'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DialogTrigger } from '@ventora/ui';
import {
  ExceptionDialog,
  count,
  parseCount,
  useDates,
  useIsPhone,
  type ExceptionFormErrors,
  type ExceptionFormValues,
} from '@ventora/screens';
import { addException, extendException } from '@/server/commercial-actions';
import { useQuotaText } from './labels';

/* „Adaugă o excepție” și prelungirea ei (FounderStates · „Excepție nouă”; D-COM-8): o limită
   care înlocuiește ce include contul, până la cel mult 12 luni, cu motiv. Prelungirea schimbă doar
   „Până la” (valoarea și motivul nu se schimbă, override_guard). Auditate pe persoana Founder. */

const MONTH_MS = 30 * 86_400_000;

export type ExceptionTarget =
  | { kind: 'add'; quotas: { key: string; kind: 'flow' | 'stock' }[]; quotaKey?: string }
  | {
      kind: 'extend';
      overrideId: string;
      quotaKey: string;
      limit: number | null;
      expiresAt: string;
    };

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

type FlowProps = {
  organizationId: string;
  business: string;
  onClose: () => void;
  onDone: (text: string) => void;
};

/** Un dialog nou pentru fiecare țintă (cheia): valorile pornesc din ea. */
export function ExceptionFlow({
  target,
  ...props
}: FlowProps & { target: ExceptionTarget | null }) {
  if (!target) return null;
  const key =
    target.kind === 'add' ? `add:${target.quotaKey ?? ''}` : `extend:${target.overrideId}`;
  return <ExceptionFlowDialog key={key} target={target} {...props} />;
}

function ExceptionFlowDialog({
  organizationId,
  business,
  target,
  onClose,
  onDone,
}: FlowProps & { target: ExceptionTarget }) {
  const t = useTranslations('founder.business.exceptionDialog');
  const ex = useTranslations('founder.business.exceptions');
  const q = useQuotaText();
  const dates = useDates();
  const phone = useIsPhone();
  const today = new Date();
  const max = addMonths(today, 12);
  const [values, setValues] = useState<ExceptionFormValues>(() =>
    target.kind === 'add'
      ? {
          quotaKey: target.quotaKey ?? target.quotas[0]?.key ?? '',
          value: '',
          until: null,
          reason: '',
        }
      : {
          quotaKey: target.quotaKey,
          value: target.limit === null ? ex('unlimited') : count(target.limit),
          until: new Date(Math.min(max.getTime(), new Date(target.expiresAt).getTime() + MONTH_MS)),
          reason: '',
        },
  );
  const [errors, setErrors] = useState<ExceptionFormErrors>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const resources =
    target.kind === 'add'
      ? target.quotas.map((x) => ({ value: x.key, label: q.limit(x.key) }))
      : [{ value: target.quotaKey, label: q.limit(target.quotaKey) }];
  const flow =
    target.kind === 'add' && target.quotas.find((x) => x.key === values.quotaKey)?.kind === 'flow';

  async function submit() {
    const e: ExceptionFormErrors = {};
    const until = values.until;
    if (!until || until <= today || until > max) e.until = t('errorUntil');
    let limit = 0;
    if (target.kind === 'add') {
      const n = parseCount(values.value);
      if (n === null) e.value = t('errorValue');
      else limit = n;
      if (!values.reason.trim()) e.reason = t('errorReason');
    }
    setErrors(e);
    if (Object.keys(e).length || !until) return;
    // the end of the chosen day, in the browser's time zone
    const end = new Date(until);
    end.setHours(23, 59, 0, 0);
    const expiresAt = (end > max ? max : end).toISOString();
    setPending(true);
    setFailed(false);
    const res =
      target.kind === 'add'
        ? await addException({
            organizationId,
            quotaKey: values.quotaKey,
            limit,
            expiresAt,
            reason: values.reason.trim(),
          })
        : await extendException({ organizationId, overrideId: target.overrideId, expiresAt });
    setPending(false);
    if (!res.ok) {
      if (res.field === 'expiresAt') setErrors({ until: t('errorUntil') });
      else setFailed(true);
      return;
    }
    onDone(target.kind === 'add' ? ex('added') : ex('extended', { date: dates.day(until) }));
  }

  return (
    <DialogTrigger isOpen onOpenChange={(o) => !o && onClose()}>
      <ExceptionDialog
        title={target.kind === 'add' ? t('title', { business }) : t('extendTitle', { business })}
        values={values}
        errors={errors}
        resources={resources}
        suffix={flow ? t('perMonth') : undefined}
        extending={target.kind === 'extend'}
        today={today}
        max={max}
        pending={pending}
        failed={failed}
        mob={phone}
        onChange={setValues}
        onCancel={onClose}
        onSubmit={() => void submit()}
      />
    </DialogTrigger>
  );
}
