'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Avatar,
  Badge,
  Button,
  Calendar,
  EmptyState,
  FormField,
  Icon,
  Input,
  Notice,
  Radio,
  RadioGroup,
  SlotPicker,
  StatusPill,
  Textarea,
  type SlotItem,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { pickerDay, isoDay } from '../new/new-format';
import { PublicActions, PublicShell, PublicSummary, type PublicBusiness } from './PublicShell';
import type { PublicBrand } from './brand';
import s from './public.module.css';

/* BookingPublic (S116 a) — the public booking page for the end client, phone first, preview.html
   StepService / StepMember / StepTime / StepDetails / StepVerify / Done 1:1: service → who → day
   and time → details with the anti-robot check → the code from the e-mail → confirmed (or sent to
   the salon). The anti-robot slot is neutral (S116-D2): the page puts the Turnstile widget in it.
   Props only: the page (/r/<slug>) and the gallery draw the same components. */

export type PublicFrame = {
  mode: ScreenMode;
  business: PublicBusiness;
  lang: string;
  onLang?: (lang: string) => void;
  brand?: PublicBrand | null;
};

const shell = (f: PublicFrame) => ({
  mode: f.mode,
  business: f.business,
  lang: f.lang,
  onLang: f.onLang,
  brand: f.brand,
});

export type PublicServiceOption = {
  id: string;
  name: string;
  /** „90 min · 350 lei” */
  meta: string;
  /** „Avans 50 lei” */
  deposit?: string | null;
};

function OptRow({ on, children }: { on: boolean; children: ReactNode }) {
  return <div className={`${s.opt} ${on ? s.on : ''}`}>{children}</div>;
}

export function PublicServiceStep(
  p: PublicFrame & {
    services: PublicServiceOption[];
    steps?: { n: number; total: number };
    onBack?: () => void;
    value: string | null;
    onChange?: (id: string) => void;
    onContinue?: () => void;
  },
) {
  const t = useTranslations('booking.public');
  const mob = p.mode === 'mobile';
  return (
    <PublicShell {...shell(p)} step={p.steps ?? { n: 1, total: 4 }} title={t('s.service')}>
      <RadioGroup aria-label={t('s.service')} value={p.value} onChange={p.onChange}>
        {p.services.map((x) => (
          <OptRow key={x.id} on={p.value === x.id}>
            <Radio value={x.id} description={x.meta} className={s.optRadio}>
              {x.name}
            </Radio>
            {x.deposit && <Badge>{x.deposit}</Badge>}
          </OptRow>
        ))}
      </RadioGroup>
      <PublicActions mode={p.mode}>
        {p.onBack && (
          <Button variant="quiet" icon="arrow-left" onPress={p.onBack}>
            {t('back')}
          </Button>
        )}
        <Button
          variant="primary"
          block={mob}
          iconEnd="arrow-right"
          isDisabled={!p.value}
          onPress={p.onContinue}
        >
          {t('continue')}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

export type PublicMemberOption = { id: string; name: string; sub?: string | null };

export function PublicMemberStep(
  p: PublicFrame & {
    summary: [string, string][];
    members: PublicMemberOption[];
    steps?: { n: number; total: number };
    /** 'any' = „Oricine e liber”. */
    value: string | null;
    onChange?: (id: string) => void;
    onBack?: () => void;
    onContinue?: () => void;
  },
) {
  const t = useTranslations('booking.public');
  const mob = p.mode === 'mobile';
  return (
    <PublicShell
      {...shell(p)}
      step={p.steps ?? { n: 2, total: 4 }}
      title={t('s.member')}
      aside={<PublicSummary rows={p.summary} policy={t('policy')} />}
    >
      {mob && <PublicSummary rows={p.summary} compact />}
      <RadioGroup aria-label={t('s.member')} value={p.value} onChange={p.onChange}>
        <OptRow on={p.value === 'any'}>
          <Radio value="any" description={t('anyoneHelp')} className={s.optRadio}>
            {t('anyone')}
          </Radio>
        </OptRow>
        {p.members.map((m) => (
          <OptRow key={m.id} on={p.value === m.id}>
            <Avatar name={m.name} size="sm" />
            <Radio value={m.id} description={m.sub ?? undefined} className={s.optRadio}>
              {m.name}
            </Radio>
          </OptRow>
        ))}
      </RadioGroup>
      <PublicActions mode={p.mode}>
        <Button variant="quiet" icon="arrow-left" onPress={p.onBack}>
          {t('back')}
        </Button>
        <Button
          variant="primary"
          block={mob}
          iconEnd="arrow-right"
          isDisabled={!p.value}
          onPress={p.onContinue}
        >
          {t('continue')}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

export type PublicDay = { date: string; label: string; disabled?: boolean };

/** The day picker: the Calendar on desktop, a strip of days on a phone. */
export function PublicDayPicker(p: {
  mode: ScreenMode;
  date: string;
  today: string;
  /** The phone's strip („Vin 6”). */
  days: PublicDay[];
  /** Desktop: the days that cannot be chosen (closed, past the horizon). */
  isDisabled?: (date: string) => boolean;
  onDate?: (date: string) => void;
}) {
  const locale = useLocale();
  if (p.mode === 'mobile') {
    return (
      <div className={s.days}>
        {p.days.map((d) => (
          <Button
            key={d.date}
            size="sm"
            variant={d.date === p.date ? 'primary' : 'secondary'}
            isDisabled={d.disabled}
            onPress={() => p.onDate?.(d.date)}
          >
            {d.label}
          </Button>
        ))}
      </div>
    );
  }
  const noon = pickerDay(p.today) ?? new Date();
  // the start of the day: a day before it cannot be chosen, today can
  const today = new Date(noon.getFullYear(), noon.getMonth(), noon.getDate());
  return (
    <div className={s.cal}>
      <Calendar
        value={pickerDay(p.date)}
        today={today}
        initialMonth={new Date(today.getFullYear(), today.getMonth(), 1)}
        locale={locale}
        isDisabled={(d) => d < today || !!p.isDisabled?.(isoDay(d))}
        onChange={(v) => v instanceof Date && p.onDate?.(isoDay(v))}
      />
    </div>
  );
}

export function PublicTimeStep(
  p: PublicFrame & {
    summary: [string, string][];
    picker: Omit<Parameters<typeof PublicDayPicker>[0], 'mode'>;
    /** 'slots': the free times; 'noday': none that day; 'none': nothing online in 30 days. */
    state: 'slots' | 'noday' | 'none';
    slots: SlotItem[];
    time: string | null;
    onTime?: (time: string) => void;
    /** 'noday': the member, the first free day („luni, 9 noiembrie”, „luni, 9 nov.”). */
    noDay?: {
      member: string;
      next: string;
      nextShort: string;
      onNext?: () => void;
      onAnyone?: () => void;
    };
    /** 'none': the service and the salon's phone. */
    none?: { service: string; phone: string; onCall?: () => void };
    /** B.9d2: a class shows its sessions (PublicSessions) instead of the free times. */
    sessions?: ReactNode;
    /** With `sessions`: a session is chosen. */
    canContinue?: boolean;
    /** The steps of the page (5 with „Alegeți salonul”). */
    steps?: { n: number; total: number };
    onBack?: () => void;
    onContinue?: () => void;
  },
) {
  const t = useTranslations('booking.public');
  const mob = p.mode === 'mobile';
  return (
    <PublicShell
      {...shell(p)}
      step={p.steps ?? { n: 3, total: 4 }}
      title={t('s.time')}
      aside={<PublicSummary rows={p.summary} policy={t('policy')} />}
    >
      {mob && <PublicSummary rows={p.summary} compact />}
      {p.state !== 'none' && <PublicDayPicker mode={p.mode} {...p.picker} />}
      {p.state === 'noday' && p.noDay ? (
        <EmptyState
          size="sm"
          icon="calendar-off"
          title={t('noSlotsTitle')}
          description={t('noSlotsBody', { member: p.noDay.member, date: p.noDay.next })}
          actions={
            <>
              <Button variant="primary" icon="calendar" onPress={p.noDay.onNext}>
                {t('noSlotsNext', { date: p.noDay.nextShort })}
              </Button>
              <Button variant="quiet" onPress={p.noDay.onAnyone}>
                {t('noSlotsAnyone')}
              </Button>
            </>
          }
        />
      ) : p.state === 'none' && p.none ? (
        <EmptyState
          size="sm"
          icon="calendar-off"
          title={t('noneTitle')}
          description={t('noneBody', { service: p.none.service, phone: p.none.phone })}
          actions={
            p.none.phone ? (
              <Button variant="primary" icon="phone" onPress={p.none.onCall}>
                {t('call')}
              </Button>
            ) : undefined
          }
        />
      ) : p.sessions ? (
        p.sessions
      ) : (
        <SlotPicker
          slots={p.slots}
          value={p.time ?? undefined}
          onChange={p.onTime}
          label={t('free')}
        />
      )}
      {p.state !== 'none' && (
        <PublicActions mode={p.mode}>
          <Button variant="quiet" icon="arrow-left" onPress={p.onBack}>
            {t('back')}
          </Button>
          <Button
            variant="primary"
            block={mob}
            iconEnd="arrow-right"
            isDisabled={p.state !== 'slots' || (p.sessions ? !p.canContinue : !p.time)}
            onPress={p.onContinue}
          >
            {t('continue')}
          </Button>
        </PublicActions>
      )}
    </PublicShell>
  );
}

export type PublicDetailsForm = { name: string; phone: string; email: string; message: string };
export type PublicDetailsErrors = Partial<Record<'name' | 'phone' | 'email' | 'captcha', string>>;

/** The anti-robot check (S116-D2): a neutral slot; the page renders the widget inside. */
export function PublicCaptcha(p: { state: 'idle' | 'ok' | 'error'; children?: ReactNode }) {
  const t = useTranslations('booking.public');
  return (
    <FormField label={t('captcha')} error={p.state === 'error' ? t('captchaError') : undefined}>
      {p.children ?? (
        <div className={`${s.captcha} ${p.state === 'error' ? s.err : ''}`}>
          <Icon
            icon={
              p.state === 'ok' ? 'circle-check' : p.state === 'error' ? 'circle-alert' : 'shield'
            }
            size={20}
          />
          <span className="body-small">{p.state === 'ok' ? t('captchaOk') : t('captchaHere')}</span>
        </div>
      )}
    </FormField>
  );
}

export function PublicDetailsStep(
  p: PublicFrame & {
    summary: [string, string][];
    form: PublicDetailsForm;
    onForm?: (patch: Partial<PublicDetailsForm>) => void;
    errors?: PublicDetailsErrors;
    /** The time was taken meanwhile: pick another; the details stay. */
    taken?: {
      time: string;
      slots: SlotItem[];
      value: string | null;
      onTime?: (t: string) => void;
    } | null;
    network?: boolean;
    captcha: { state: 'idle' | 'ok' | 'error'; widget?: ReactNode };
    /** Extra fields (BookingCustomForms, BookingHealthFields), drawn by their screens. */
    extra?: ReactNode;
    privacyHref: string;
    steps?: { n: number; total: number };
    sending?: boolean;
    onBack?: () => void;
    onSend?: () => void;
  },
) {
  const t = useTranslations('booking.public');
  const ui = useTranslations('ui');
  const mob = p.mode === 'mobile';
  const e = p.errors ?? {};
  const any = Object.keys(e).length > 0;
  return (
    <PublicShell
      {...shell(p)}
      step={p.steps ?? { n: 4, total: 4 }}
      title={t('s.details')}
      aside={<PublicSummary rows={p.summary} policy={t('policy')} />}
    >
      {mob && <PublicSummary rows={p.summary} compact />}
      {p.taken && (
        <Notice
          className={s.notice}
          tone="attention"
          title={t('err.taken', { time: p.taken.time })}
        >
          <SlotPicker
            slots={p.taken.slots}
            value={p.taken.value ?? undefined}
            onChange={p.taken.onTime}
            label={t('free')}
          />
        </Notice>
      )}
      {any && <Notice className={s.notice} tone="danger" title={t('err.title')} />}
      {p.network && <Notice className={s.notice} tone="danger" title={t('err.network')} />}
      <div className={s.form}>
        <FormField label={t('name')} required error={e.name}>
          <Input
            value={p.form.name}
            onChange={(ev) => p.onForm?.({ name: ev.target.value })}
            isInvalid={!!e.name}
            autoComplete="name"
            maxLength={200}
          />
        </FormField>
        <FormField label={t('phone')} required error={e.phone}>
          <Input
            type="tel"
            value={p.form.phone}
            onChange={(ev) => p.onForm?.({ phone: ev.target.value })}
            isInvalid={!!e.phone}
            autoComplete="tel"
            maxLength={40}
          />
        </FormField>
        <FormField
          label={t('email')}
          required
          hint={e.email ? undefined : t('emailHelp')}
          error={e.email}
        >
          <Input
            type="email"
            value={p.form.email}
            onChange={(ev) => p.onForm?.({ email: ev.target.value })}
            isInvalid={!!e.email}
            autoComplete="email"
            maxLength={254}
          />
        </FormField>
        <FormField label={t('note')} isOptional optionalLabel={ui('optional')}>
          <Textarea
            rows={2}
            maxLength={500}
            value={p.form.message}
            onChange={(ev) => p.onForm?.({ message: ev.target.value })}
          />
        </FormField>
        {p.extra}
        <PublicCaptcha state={e.captcha ? 'error' : p.captcha.state}>
          {p.captcha.widget}
        </PublicCaptcha>
        <p className={`caption ${s.muted}`}>
          {t('privacy')}{' '}
          <a className="v-link" href={p.privacyHref}>
            {t('privacyLink')}
          </a>
        </p>
      </div>
      <PublicActions mode={p.mode}>
        <Button variant="quiet" icon="arrow-left" onPress={p.onBack}>
          {t('back')}
        </Button>
        <Button variant="primary" block={mob} icon="mail" isPending={p.sending} onPress={p.onSend}>
          {t('sendCode')}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

export function PublicVerifyStep(
  p: PublicFrame & {
    summary: [string, string][];
    email: string;
    code: string;
    onCode?: (code: string) => void;
    /** wrong: tries left; expired: a new code left; tooMany: wait 10 minutes. */
    state: 'idle' | 'wrong' | 'expired' | 'tooMany';
    triesLeft?: number;
    /** „12:30”, „9:42” */
    held: { time: string; left: string };
    steps?: { n: number; total: number };
    /** Seconds until „Retrimite codul” (0 = now). */
    resendIn: number;
    onResend?: () => void;
    onChangeEmail?: () => void;
    busy?: boolean;
    onConfirm?: () => void;
  },
) {
  const t = useTranslations('booking.public');
  const mob = p.mode === 'mobile';
  const err =
    p.state === 'wrong'
      ? t('err.code', { n: p.triesLeft ?? 0 })
      : p.state === 'tooMany'
        ? t('err.tooMany')
        : undefined;
  return (
    <PublicShell
      {...shell(p)}
      step={p.steps ?? { n: 4, total: 4 }}
      title={t('s.verify')}
      aside={<PublicSummary rows={p.summary} policy={t('policy')} />}
    >
      <p className="body">{t('verifyBody', { email: p.email })}</p>
      {p.state === 'expired' && (
        <Notice
          className={s.notice}
          tone="attention"
          title={t('err.expired', { email: p.email })}
        />
      )}
      <div className={s.code}>
        <FormField label={t('code')} error={err}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            size="lg"
            value={p.code}
            onChange={(ev) => p.onCode?.(ev.target.value.replace(/\D/g, ''))}
            isInvalid={!!err}
            disabled={p.state === 'tooMany'}
          />
        </FormField>
      </div>
      <div className={s.held}>
        <Icon icon="timer" size={16} />
        <span className="body-small">{t('held', { time: p.held.time, left: p.held.left })}</span>
      </div>
      <div className={s.row}>
        <Button
          size="sm"
          variant="quiet"
          icon="refresh-cw"
          isDisabled={p.state === 'tooMany' || (p.resendIn > 0 && p.state !== 'expired')}
          onPress={p.onResend}
        >
          {t('resend')}
        </Button>
        <span className={`caption ${s.muted}`}>
          {p.state === 'tooMany' || p.resendIn <= 0 ? '' : t('resendIn', { s: p.resendIn })}
        </span>
        <Button size="sm" variant="quiet" icon="pencil" onPress={p.onChangeEmail}>
          {t('changeEmail')}
        </Button>
      </div>
      <PublicActions mode={p.mode}>
        <Button
          variant="primary"
          block={mob}
          icon="check"
          isDisabled={p.state === 'tooMany'}
          isPending={p.busy}
          onPress={p.onConfirm}
        >
          {t('confirm')}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

export function PublicDone(
  p: PublicFrame & {
    summary: [string, string][];
    /** true: the salon confirms manually („Neconfirmată”). */
    pending: boolean;
    /** „vineri, 6 noiembrie, la 12:30” */
    when: string;
    email: string;
    onAddCal?: () => void;
    onManage?: () => void;
  },
) {
  const t = useTranslations('booking.public');
  const st = useTranslations('booking.status');
  const mob = p.mode === 'mobile';
  return (
    <PublicShell {...shell(p)}>
      <div className={s.done}>
        <span className={`${s.doneIcon} ${p.pending ? s.p : ''}`}>
          <Icon icon={p.pending ? 'clock' : 'check'} size={28} />
        </span>
        <h1 className={mob ? 'display-m' : 'display-l'}>
          {p.pending ? t('pendingTitle') : t('doneTitle')}
        </h1>
        <p className="body">
          {p.pending ? t('pendingBody') : t('doneBody', { when: p.when, email: p.email })}
        </p>
        <div className={s.doneSum}>
          <StatusPill tone={p.pending ? 'neutral' : 'done'} icon={p.pending ? 'clock' : 'check'}>
            {st(p.pending ? 'unconfirmed' : 'confirmed')}
          </StatusPill>
          <PublicSummary rows={p.summary} compact />
        </div>
        <PublicActions mode={p.mode}>
          {!p.pending && p.onAddCal && (
            <Button variant="primary" block={mob} icon="calendar-check" onPress={p.onAddCal}>
              {t('addCal')}
            </Button>
          )}
          <Button variant={p.pending ? 'secondary' : 'quiet'} block={mob} onPress={p.onManage}>
            {t('manage')}
          </Button>
        </PublicActions>
      </div>
    </PublicShell>
  );
}
