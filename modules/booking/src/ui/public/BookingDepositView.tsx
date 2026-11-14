'use client';

import { useTranslations } from 'next-intl';
import { Button, Checkbox, Icon, Notice, StatusPill, StripeSlot, type IconName } from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { PublicActions, PublicShell, PublicSummary, type PublicBusiness } from './PublicShell';
import s from './public.module.css';

/* BookingDeposit (S116 b) — the deposit through Stripe inside the public booking, preview.html
   Pay / Result 1:1: the amounts (price, deposit now, the rest at the salon), the salon's policy,
   the checkbox (unchecked: „Plătește” stays disabled), the card form in StripeSlot, the 15-minute
   hold; then paid, waiting for payment, expired. The server is B.22 (Stripe Connect, the saga of
   „Așteaptă plata”), not built yet: the gallery draws it. Props only. */

export type DepositPayState = 'start' | 'ready' | 'bank' | 'processing' | 'fail';
export type DepositResult = 'ok' | 'wait' | 'expired';

type Shared = {
  mode: ScreenMode;
  business: PublicBusiness;
  lang: string;
  onLang?: (lang: string) => void;
  /** The summary rows (service, person, when, price, deposit). */
  summary: [string, string][];
  /** „50 lei” */
  amount: string;
};

function Policy({ hours }: { hours: number }) {
  const t = useTranslations('booking.deposit');
  const rules: [IconName, string][] = [
    ['calendar-check', t('policy.inTime', { hours })],
    ['calendar-off', t('policy.late')],
    ['rotate-ccw', t('policy.salon')],
  ];
  return (
    <div className={s.pay}>
      <p className="subheading">{t('policyTitle')}</p>
      {rules.map(([icon, text]) => (
        <p key={icon} className={`body-small ${s.rule}`}>
          <Icon icon={icon} size={16} />
          {text}
        </p>
      ))}
    </div>
  );
}

export function DepositPayStep(
  p: Shared & {
    state: DepositPayState;
    /** „350 lei”, „300 lei” */
    price: string;
    rest: string;
    hours: number;
    accepted: boolean;
    onAccept?: (v: boolean) => void;
    /** „12:30” and the time left („14:12”). */
    hold: { time: string; left: string };
    onBack?: () => void;
    onPay?: () => void;
  },
) {
  const t = useTranslations('booking.deposit');
  const pub = useTranslations('booking.public');
  const pay = useTranslations('pay');
  const mob = p.mode === 'mobile';
  const busy = p.state === 'processing' || p.state === 'bank';
  const rows: [string, string, boolean][] = [
    [t('k.price'), p.price, false],
    [t('k.now'), p.amount, true],
    [t('k.rest'), p.rest, false],
  ];
  return (
    <PublicShell
      mode={p.mode}
      business={p.business}
      lang={p.lang}
      onLang={p.onLang}
      step={{ n: 4, total: 4 }}
      title={t('title')}
      aside={<PublicSummary rows={p.summary} policy={pub('policy')} />}
    >
      <p className="body">{t('lead')}</p>
      {mob && <PublicSummary rows={p.summary} compact />}
      <dl className={`${s.kv} ${s.box}`}>
        {rows.map(([k, v, strong]) => (
          <DlRow key={k} k={k} v={v} strong={strong} />
        ))}
      </dl>
      <Policy hours={p.hours} />
      {p.state === 'fail' && (
        <Notice className={s.notice} tone="danger" title={t('failTitle')}>
          {t('failBody', { reason: t('reason') })}
        </Notice>
      )}
      {p.state === 'bank' && (
        <Notice className={s.notice} tone="neutral" icon="smartphone" title={t('bank')} />
      )}
      <Checkbox
        isSelected={p.state !== 'start' && p.accepted}
        isDisabled={busy}
        onChange={p.onAccept}
      >
        {t('accept')}
      </Checkbox>
      <StripeSlot labels={{ stripeSlot: pay('stripeSlot'), saveCard: pay('saveCard') }} />
      <p className={`caption ${s.muted}`}>{t('secure')}</p>
      <div className={s.held}>
        <Icon icon="timer" size={16} />
        <span className="body-small">{t('hold', { time: p.hold.time, left: p.hold.left })}</span>
      </div>
      <PublicActions mode={p.mode}>
        <Button variant="quiet" icon="arrow-left" isDisabled={busy} onPress={p.onBack}>
          {pub('back')}
        </Button>
        <Button
          variant="primary"
          block={mob}
          icon="lock"
          isPending={busy}
          isDisabled={p.state === 'start'}
          aria-label={busy ? t('processing') : undefined}
          onPress={p.onPay}
        >
          {p.state === 'fail' ? t('retry') : t('pay', { amount: p.amount })}
        </Button>
      </PublicActions>
    </PublicShell>
  );
}

function DlRow({ k, v, strong }: { k: string; v: string; strong: boolean }) {
  return (
    <>
      <dt className="caption">{k}</dt>
      <dd className={`${strong ? 'body-strong' : 'body'} v-num ${s.num}`}>{v}</dd>
    </>
  );
}

export function DepositResultView(
  p: Shared & {
    kind: DepositResult;
    /** „cristina.dobre@gmail.com” (ok), „12:07” (wait). */
    email: string;
    until: string;
    onAddCal?: () => void;
    onPay?: () => void;
    onChooseAgain?: () => void;
    onManage?: () => void;
  },
) {
  const t = useTranslations('booking.deposit');
  const pub = useTranslations('booking.public');
  const st = useTranslations('booking.status');
  const mob = p.mode === 'mobile';
  const cfg = {
    ok: {
      icon: 'check' as IconName,
      plain: false,
      title: t('okTitle'),
      body: t('okBody', { amount: p.amount, email: p.email }),
      pill: { tone: 'done' as const, icon: 'check' as IconName, label: st('confirmed') },
    },
    wait: {
      icon: 'wallet' as IconName,
      plain: true,
      title: t('waitTitle'),
      body: t('waitBody', { until: p.until }),
      pill: { tone: 'neutral' as const, icon: 'wallet' as IconName, label: st('awaitingPayment') },
    },
    expired: {
      icon: 'timer' as IconName,
      plain: true,
      title: t('expiredTitle'),
      body: t('expiredBody'),
      pill: null,
    },
  }[p.kind];
  return (
    <PublicShell mode={p.mode} business={p.business} lang={p.lang} onLang={p.onLang}>
      <div className={s.done}>
        <span className={`${s.doneIcon} ${cfg.plain ? s.p : ''}`}>
          <Icon icon={cfg.icon} size={28} />
        </span>
        <h1 className={mob ? 'display-m' : 'display-l'}>{cfg.title}</h1>
        <p className="body">{cfg.body}</p>
        {cfg.pill && (
          <div className={s.doneSum}>
            <StatusPill tone={cfg.pill.tone} icon={cfg.pill.icon}>
              {cfg.pill.label}
            </StatusPill>
            <PublicSummary rows={p.summary} compact />
          </div>
        )}
        <PublicActions mode={p.mode}>
          {p.kind === 'ok' && (
            <Button variant="primary" block={mob} icon="calendar-check" onPress={p.onAddCal}>
              {pub('addCal')}
            </Button>
          )}
          {p.kind === 'wait' && (
            <Button variant="primary" block={mob} icon="lock" onPress={p.onPay}>
              {t('pay', { amount: p.amount })}
            </Button>
          )}
          {p.kind === 'expired' ? (
            <Button variant="primary" block={mob} icon="calendar" onPress={p.onChooseAgain}>
              {t('chooseAgain')}
            </Button>
          ) : (
            <Button variant="quiet" block={mob} onPress={p.onManage}>
              {pub('manage')}
            </Button>
          )}
        </PublicActions>
      </div>
    </PublicShell>
  );
}
