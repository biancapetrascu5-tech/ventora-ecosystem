'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Icon,
  Notice,
  SlotPicker,
  StatusPill,
  type IconName,
  type SlotItem,
} from '@ventora/ui';
import { PublicDayPicker, type PublicFrame } from './BookingPublicView';
import { PublicActions, PublicShell } from './PublicShell';
import s from './public.module.css';

/* BookingClientManage (B.11 / B.11b, S125, S146) — the client's page for moving or cancelling a
   booking (/r/<slug>/m/<token>), without an account, preview.html Overview / Move / Cancel / Stop
   / Final / Link146 1:1: the booking and the policy; another day and time held 10 minutes; the
   cancellation with the salon's deposit policy; the states that stop online changes; the two
   results; the link after the start, expired, revoked. Same shell as BookingPublic. Props only. */

const shell = (f: PublicFrame) => ({
  mode: f.mode,
  business: f.business,
  lang: f.lang,
  onLang: f.onLang,
  brand: f.brand,
});

function Line({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className={`body-small ${s.line}`}>
      <Icon icon={icon} size={16} />
      {children}
    </p>
  );
}

/** The booking's rows (salon, service, who, when, price, deposit, rest). */
export function ManageSummary({ rows, compact }: { rows: [string, string][]; compact?: boolean }) {
  return (
    <div className={`${s.sum} ${compact ? s.c : ''}`}>
      <dl className={s.kv}>
        {rows.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
      </dl>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="caption">{k}</dt>
      <dd className="body">{v}</dd>
    </>
  );
}

function Head({
  mob,
  icon,
  tone,
  title,
}: {
  mob: boolean;
  icon: IconName;
  tone?: '' | 'p' | 'bad';
  title: string;
}) {
  return (
    <>
      <span className={`${s.doneIcon} ${tone ? s[tone] : ''}`}>
        <Icon icon={icon} size={28} />
      </span>
      <h1 className={mob ? 'display-m' : 'display-l'}>{title}</h1>
    </>
  );
}

export type ManagePolicy = {
  /** „joi, 12 noiembrie, la 12:30” */
  freeUntil: string;
  hours: number;
  /** The deposit („50 lei”) or, without one, the late fee. */
  late: { kind: 'deposit' | 'fee'; amount: string } | null;
  onlineHours: number;
};

export function ManageOverview(
  p: PublicFrame & {
    summary: [string, string][];
    status: 'confirmed' | 'unconfirmed';
    policy: ManagePolicy;
    onMove?: () => void;
    onCancel?: () => void;
  },
) {
  const t = useTranslations('booking.manage');
  const st = useTranslations('booking.status');
  const mob = p.mode === 'mobile';
  const late = p.policy.late
    ? ` ${p.policy.late.kind === 'deposit' ? t('policyLateDeposit', { amount: p.policy.late.amount }) : t('policyLateFee', { amount: p.policy.late.amount })}`
    : '';
  return (
    <PublicShell {...shell(p)} title={t('title')}>
      <div>
        <StatusPill tone="neutral" icon={p.status === 'confirmed' ? 'check' : 'clock'}>
          {st(p.status)}
        </StatusPill>
      </div>
      <ManageSummary rows={p.summary} />
      <div className={s.pol}>
        <Line icon="calendar-check">
          {t('policyFree', { date: p.policy.freeUntil, hours: p.policy.hours }) + late}
        </Line>
        <Line icon="clock">{t('policyOnline', { hours: p.policy.onlineHours })}</Line>
      </div>
      <PublicActions mode={p.mode}>
        {p.onCancel && (
          <Button variant="quiet" icon="x" block={mob} onPress={p.onCancel}>
            {t('cancelAction')}
          </Button>
        )}
        {p.onMove && (
          <Button variant="primary" icon="calendar" block={mob} onPress={p.onMove}>
            {t('moveAction')}
          </Button>
        )}
      </PublicActions>
    </PublicShell>
  );
}

export function ManageMove(
  p: PublicFrame & {
    summary: [string, string][];
    member: string;
    /** „Vin, 13 nov. · 12:30”: the booking's time now. */
    from: string;
    picker: Omit<Parameters<typeof PublicDayPicker>[0], 'mode'>;
    slots: SlotItem[];
    time: string | null;
    onTime?: (time: string) => void;
    /** The chosen time held: „15:30”, „9:42”. */
    held?: { time: string; left: string } | null;
    /** The 10 minutes passed: the time that was held. */
    expired?: { time: string } | null;
    /** „50 lei”: the deposit moves with the booking. */
    deposit?: string | null;
    /** „luni, 16 nov., 15:30” */
    submitWhen?: string | null;
    busy?: boolean;
    onBack?: () => void;
    onSubmit?: () => void;
  },
) {
  const t = useTranslations('booking.manage');
  const pub = useTranslations('booking.public');
  const mob = p.mode === 'mobile';
  return (
    <PublicShell {...shell(p)} title={t('move.title')} aside={<ManageSummary rows={p.summary} />}>
      <p className="body">{t('move.lead', { member: p.member })}</p>
      {mob && <p className={`caption ${s.muted}`}>{t('move.from', { when: p.from })}</p>}
      {p.expired && (
        <Notice className={s.notice} tone="attention" icon="timer" title={t('move.expiredTitle')}>
          {t('move.expiredBody', { time: p.expired.time, old: p.from })}
        </Notice>
      )}
      <PublicDayPicker mode={p.mode} {...p.picker} />
      <SlotPicker
        slots={p.slots}
        value={p.time ?? undefined}
        onChange={p.onTime}
        label={pub('free')}
      />
      {p.held && !p.expired && (
        <div className={s.held}>
          <Icon icon="timer" size={16} />
          <span className="body-small">
            {t('move.held', { time: p.held.time, left: p.held.left })}
          </span>
        </div>
      )}
      {p.deposit && <Line icon="wallet">{t('move.depositKept', { amount: p.deposit })}</Line>}
      <PublicActions mode={p.mode}>
        <Button variant="quiet" icon="arrow-left" onPress={p.onBack}>
          {t('back')}
        </Button>
        <Button
          variant="primary"
          block={mob}
          icon="check"
          isDisabled={!!p.expired || !p.submitWhen}
          isPending={p.busy}
          onPress={p.onSubmit}
        >
          {t('move.submit', { when: p.submitWhen ?? '' })}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

export function ManageCancel(
  p: PublicFrame & {
    service: string;
    member: string;
    when: string;
    hours: number;
    /** Inside the free cancellation (late) or not; the deposit or the fee. */
    late: boolean;
    deposit?: string | null;
    fee?: string | null;
    busy?: boolean;
    onKeep?: () => void;
    onSubmit?: () => void;
  },
) {
  const t = useTranslations('booking.manage');
  const dep = useTranslations('booking.deposit');
  const mob = p.mode === 'mobile';
  const msg = p.late
    ? p.deposit
      ? t('cancel.lateDeposit', { hours: p.hours, amount: p.deposit })
      : t('cancel.lateFee', { hours: p.hours, amount: p.fee ?? '' })
    : p.deposit
      ? t('cancel.freeDeposit', { hours: p.hours, amount: p.deposit })
      : t('cancel.free', { hours: p.hours });
  return (
    <PublicShell {...shell(p)} title={t('cancel.title')}>
      <p className="body">
        {t('cancel.lead', { service: p.service, member: p.member, when: p.when })}
      </p>
      <Notice
        className={s.notice}
        tone={p.late ? 'attention' : 'neutral'}
        icon={p.late ? 'triangle-alert' : 'circle-check'}
        title={msg}
      />
      <div className={`${s.stack} ${s.pol}`}>
        <p className="subheading">{t('cancel.policy')}</p>
        <p className="body-small">{dep('policy.inTime', { hours: p.hours })}</p>
        <p className="body-small">{dep('policy.late')}</p>
        <p className="body-small">{dep('policy.salon')}</p>
      </div>
      <PublicActions mode={p.mode}>
        <Button variant="quiet" block={mob} onPress={p.onKeep}>
          {t('cancel.keep')}
        </Button>
        <Button variant="danger" icon="x" block={mob} isPending={p.busy} onPress={p.onSubmit}>
          {t('cancel.submit')}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

export type ManageStopKind = 'tooLate' | 'cancelled' | 'invalid' | 'done' | 'closed';

/** The states that stop online changes (S125). */
export function ManageStop(
  p: PublicFrame & {
    kind: ManageStopKind;
    /** The body's values: when, hours, phone, date, service, member, business. */
    v: Record<string, string>;
    /** The salon cancelled it (not the client). */
    bySalon?: boolean;
    summary?: [string, string][] | null;
    phone?: string | null;
    onCall?: () => void;
    onRebook?: () => void;
  },
) {
  const t = useTranslations('booking.manage');
  const st = useTranslations('booking.status');
  const mob = p.mode === 'mobile';
  const C: Record<
    ManageStopKind,
    { icon: IconName; tone: '' | 'p' | 'bad'; body: string; call?: boolean; rebook?: boolean }
  > = {
    tooLate: { icon: 'clock', tone: 'p', body: t('tooLate.body', p.v), call: true },
    cancelled: {
      icon: 'x',
      tone: 'p',
      body: p.bySalon ? t('cancelled.bySalon', p.v) : t('cancelled.bySelf', p.v),
      rebook: true,
    },
    invalid: { icon: 'circle-alert', tone: 'bad', body: t('invalid.body'), call: !!p.phone },
    done: { icon: 'check-check', tone: '', body: t('done.body', p.v), rebook: true },
    closed: { icon: 'store', tone: 'p', body: t('closed.body', p.v), call: true },
  };
  const c = C[p.kind];
  return (
    <PublicShell {...shell(p)}>
      <div className={s.done}>
        <Head mob={mob} icon={c.icon} tone={c.tone} title={t(`${p.kind}.title`)} />
        <p className="body">{c.body}</p>
        {p.summary && (
          <div className={s.doneSum}>
            {p.kind === 'cancelled' && (
              <StatusPill tone="neutral" icon="x">
                {st('cancelled')}
              </StatusPill>
            )}
            <ManageSummary rows={p.summary} compact />
          </div>
        )}
        <PublicActions mode={p.mode} stretch>
          {c.call && p.phone && (
            <Button variant="primary" icon="phone" block={mob} onPress={p.onCall}>
              {`${t('call')} · ${p.phone}`}
            </Button>
          )}
          {c.rebook && (
            <Button variant="primary" icon="calendar" block={mob} onPress={p.onRebook}>
              {t('rebook')}
            </Button>
          )}
        </PublicActions>
      </div>
    </PublicShell>
  );
}

/** „Am mutat programarea” / „Am anulat programarea”. */
export function ManageFinal(
  p: PublicFrame & {
    kind: 'moved' | 'cancelled';
    when: string;
    /** The client's e-mail (the confirmation went there); absent = the line is not drawn. */
    email?: string | null;
    summary?: [string, string][] | null;
    /** The deposit refunded to the card („50 lei”, „4242”); B.22. */
    refund?: { amount: string; last4: string } | null;
    onAddCal?: () => void;
    onRebook?: () => void;
  },
) {
  const t = useTranslations('booking.manage');
  const st = useTranslations('booking.status');
  const mob = p.mode === 'mobile';
  const moved = p.kind === 'moved';
  return (
    <PublicShell {...shell(p)}>
      <div className={s.done}>
        <Head
          mob={mob}
          icon={moved ? 'calendar-check' : 'check'}
          title={moved ? t('moved.title') : t('cancelledDone.title')}
        />
        <p className="body">
          {moved ? t('moved.body', { when: p.when }) : t('cancelledDone.body', { when: p.when })}
        </p>
        {moved && p.summary && (
          <div className={s.doneSum}>
            <StatusPill tone="done" icon="check">
              {st('confirmed')}
            </StatusPill>
            <ManageSummary rows={p.summary} compact />
          </div>
        )}
        <div className={s.stack}>
          {p.email && <Line icon="mail">{t('next.email', { email: p.email })}</Line>}
          {!moved && p.refund && (
            <Line icon="wallet">
              {t('next.refund', { amount: p.refund.amount, last4: p.refund.last4 })}
            </Line>
          )}
        </div>
        <PublicActions mode={p.mode} stretch>
          {moved ? (
            <Button variant="primary" icon="calendar-check" block={mob} onPress={p.onAddCal}>
              {t('addCal')}
            </Button>
          ) : (
            <Button variant="primary" icon="calendar" block={mob} onPress={p.onRebook}>
              {t('rebook')}
            </Button>
          )}
        </PublicActions>
      </div>
    </PublicShell>
  );
}

/** S146 · B.11b: the link after the start, expired 30 days after, revoked after an erasure. */
export function ManageLink(
  p: PublicFrame & {
    kind: 'started' | 'expired' | 'revoked';
    /** service, who, when (not for „revoked”). */
    summary?: [string, string][] | null;
    /** The salon's phone; absent = no line, no „Sună”. */
    phone?: string | null;
    onCall?: () => void;
    onBookAgain?: () => void;
  },
) {
  const t = useTranslations('booking.manage');
  const st = useTranslations('booking.status');
  const mob = p.mode === 'mobile';
  const started = p.kind === 'started';
  return (
    <PublicShell {...shell(p)}>
      <div className={s.done}>
        <Head
          mob={mob}
          icon={started ? 'clock' : 'circle-alert'}
          tone={started ? 'p' : 'bad'}
          title={started ? t('started.title') : t('invalid.title')}
        />
        <p className="body">
          {started
            ? t('started.body')
            : p.kind === 'expired'
              ? t('expired.body')
              : t('revoked.body')}
        </p>
        {p.kind !== 'revoked' && p.summary && (
          <div className={s.doneSum}>
            {started ? (
              <StatusPill tone="attention" icon="circle-dot">
                {st('inProgress')}
              </StatusPill>
            ) : (
              <StatusPill tone="done" icon="check-check">
                {st('done')}
              </StatusPill>
            )}
            <ManageSummary rows={p.summary} compact />
          </div>
        )}
        {p.phone && <Line icon="phone">{t('salonPhone', { phone: p.phone })}</Line>}
        <PublicActions mode={p.mode} stretch>
          {started ? (
            p.phone && (
              <Button variant="primary" icon="phone" block={mob} onPress={p.onCall}>
                {`${t('call')} · ${p.phone}`}
              </Button>
            )
          ) : (
            <>
              {p.phone && (
                <Button variant="secondary" icon="phone" block={mob} onPress={p.onCall}>
                  {t('call')}
                </Button>
              )}
              <Button variant="primary" icon="calendar" block={mob} onPress={p.onBookAgain}>
                {t('bookAgain')}
              </Button>
            </>
          )}
        </PublicActions>
      </div>
    </PublicShell>
  );
}
