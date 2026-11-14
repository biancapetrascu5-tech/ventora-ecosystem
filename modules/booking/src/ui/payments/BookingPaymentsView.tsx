'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  Checkbox,
  Dialog,
  FormField,
  Icon,
  Input,
  Notice,
  PageHeader,
  Radio,
  RadioGroup,
  SegmentedControl,
  Sheet,
  SheetSection,
  StatusPill,
  Tabs,
  Toggle,
  type IconName,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import s from './payments.module.css';

/* BookingPayments (S116 d) — EasyBook · Setări · „Plăți și avans”, preview.html Settings 1:1: the
   salon's Stripe Connect account in 4 states (neconectat, în verificare, activ, cu probleme) and
   the deposit (on / off, fixed or percent, which services, „Risc ridicat”, the 15-minute hold,
   Stripe's fee), the refund policy and „Așa vede clientul”; the unsaved bar and „Deconectează…”.
   The server is B.22 (Stripe Connect), not built yet: the gallery draws the screen, the
   application has no route. Props only. */

export type StripeState = 'none' | 'pending' | 'active' | 'problem';
export type PaymentsTab = 'hours' | 'rules' | 'resources' | 'reminders' | 'payments';
const TABS: PaymentsTab[] = ['hours', 'rules', 'resources', 'reminders', 'payments'];

const LOOK: Record<StripeState, { tone: 'neutral' | 'done' | 'attention'; icon: IconName }> = {
  none: { tone: 'neutral', icon: 'circle' },
  pending: { tone: 'neutral', icon: 'clock' },
  active: { tone: 'done', icon: 'check' },
  problem: { tone: 'attention', icon: 'triangle-alert' },
};

export type DepositForm = {
  on: boolean;
  kind: 'fixed' | 'percent';
  /** „50” (lei) or „20” (%) */
  amount: string;
  /** „70 lei”: the example of the percentage. */
  example: string;
  services: 'all' | 'some';
  serviceOptions: { id: string; name: string; on: boolean }[];
  riskAll: boolean;
  refund: 'window' | 'always';
  /** The free-cancellation window (Setări · Reguli). */
  hours: number;
};

export type BookingPaymentsViewProps = {
  mode: ScreenMode;
  stripe: StripeState;
  deposit: DepositForm;
  unit: string;
  unsaved?: boolean;
  onTab?: (tab: PaymentsTab) => void;
  onConnect?: () => void;
  onOpenStripe?: () => void;
  onDisconnect?: () => void;
  onSave?: () => void;
};

function StripeBox({ mode, stripe, ...p }: BookingPaymentsViewProps) {
  const t = useTranslations('booking.payments');
  const mob = mode === 'mobile';
  const look = LOOK[stripe];
  const block = mob ? { block: true } : {};
  return (
    <Sheet>
      <SheetSection title={t('stripe')} description={t('stripeLead')}>
        <div className={s.stack}>
          <div>
            <StatusPill tone={look.tone} icon={look.icon}>
              {t(`st.${stripe}`)}
            </StatusPill>
          </div>
          {stripe === 'problem' ? (
            <Notice className={s.notice} tone="attention" icon="triangle-alert">
              {t('problem.body')}
            </Notice>
          ) : (
            <p className="body-small">{t(`${stripe}.body`)}</p>
          )}
          <div className={s.row}>
            {stripe === 'none' && (
              <Button variant="primary" icon="external-link" onPress={p.onConnect} {...block}>
                {t('none.action')}
              </Button>
            )}
            {stripe === 'pending' && (
              <Button variant="secondary" icon="external-link" onPress={p.onOpenStripe} {...block}>
                {t('pending.action')}
              </Button>
            )}
            {stripe === 'active' && (
              <>
                <Button variant="secondary" icon="external-link" onPress={p.onOpenStripe}>
                  {t('active.open')}
                </Button>
                <Button variant="quiet" onPress={p.onDisconnect}>
                  {t('active.disconnect')}
                </Button>
              </>
            )}
            {stripe === 'problem' && (
              <Button variant="primary" icon="external-link" onPress={p.onOpenStripe} {...block}>
                {t('problem.action')}
              </Button>
            )}
          </div>
        </div>
      </SheetSection>
    </Sheet>
  );
}

function DepositBox({ mode, stripe, deposit: d, unit }: BookingPaymentsViewProps) {
  const t = useTranslations('booking.payments');
  const dt = useTranslations('booking.deposit');
  const off = stripe !== 'active';
  const pos = mode === 'mobile' ? 'start' : 'end';
  return (
    <Sheet>
      <SheetSection title={t('deposit')}>
        <div className={s.stack}>
          <Toggle
            isSelected={!off && d.on}
            isDisabled={off}
            labelPosition={pos}
            description={off ? t('needStripe') : t('depositOnHelp')}
          >
            {t('depositOn')}
          </Toggle>
          {!off && (
            <>
              <div className={s.start}>
                <SegmentedControl
                  aria-label={t('kind')}
                  value={d.kind}
                  options={[
                    { value: 'fixed', label: t('fixed') },
                    { value: 'percent', label: t('percent') },
                  ]}
                />
              </div>
              {d.kind === 'fixed' ? (
                <FormField label={t('amount')}>
                  <div className={s.short}>
                    <Input defaultValue={d.amount} suffix={unit} inputMode="numeric" />
                  </div>
                </FormField>
              ) : (
                <FormField label={t('percentLabel')} hint={t('percentHelp', { amount: d.example })}>
                  <div className={s.short}>
                    <Input defaultValue={d.amount} suffix="%" inputMode="numeric" />
                  </div>
                </FormField>
              )}
              <RadioGroup label={t('services')} value={d.services}>
                <Radio value="all">{t('servicesAll')}</Radio>
                <Radio value="some">{t('servicesSome')}</Radio>
              </RadioGroup>
              <div className={`${s.row} ${s.services}`}>
                {d.serviceOptions.map((o) => (
                  <Checkbox key={o.id} isSelected={o.on}>
                    {o.name}
                  </Checkbox>
                ))}
              </div>
              <Toggle isSelected={d.riskAll} labelPosition={pos}>
                {t('riskAll')}
              </Toggle>
              <p className={`body-small ${s.line}`}>
                <Icon icon="timer" size={16} />
                {t('hold')}
              </p>
              <p className={`body-small ${s.line}`}>
                <Icon icon="info" size={16} />
                {t('fees')}
              </p>
            </>
          )}
        </div>
      </SheetSection>
      {!off && (
        <SheetSection title={t('refundTitle')}>
          <div className={s.stack}>
            <RadioGroup label={t('refundTitle')} value={d.refund}>
              <Radio value="window" description={t('refund.windowHelp')}>
                {t('refund.window', { hours: d.hours })}
              </Radio>
              <Radio value="always" description={t('refund.alwaysHelp')}>
                {t('refund.always')}
              </Radio>
            </RadioGroup>
            <Notice className={s.notice} tone="neutral" icon="rotate-ccw">
              {t('refund.salon')}
            </Notice>
          </div>
        </SheetSection>
      )}
      {!off && (
        <SheetSection title={t('preview')}>
          <div className={s.sum}>
            {(
              [
                ['calendar-check', dt('policy.inTime', { hours: d.hours })],
                ['calendar-off', dt('policy.late')],
                ['rotate-ccw', dt('policy.salon')],
              ] as const
            ).map(([icon, text]) => (
              <p key={icon} className={`body-small ${s.rule}`}>
                <Icon icon={icon} size={16} />
                {text}
              </p>
            ))}
          </div>
        </SheetSection>
      )}
    </Sheet>
  );
}

export function BookingPaymentsView(p: BookingPaymentsViewProps) {
  const t = useTranslations('booking.payments');
  const settings = useTranslations('booking.settings');
  const mob = p.mode === 'mobile';
  return (
    <>
      <PageHeader title={t('settingsTitle')} />
      <div className={`${s.tabs} ${mob ? s.m : ''}`}>
        <Tabs
          label={settings('tabs.label')}
          selectedKey="payments"
          onSelectionChange={(k) => p.onTab?.(k as PaymentsTab)}
          items={TABS.map((id) => ({ id, label: t(`tabs.${id}`) }))}
        />
      </div>
      <div className={`${s.body} ${mob ? s.m : ''}`}>
        <StripeBox {...p} />
        <DepositBox {...p} />
      </div>
      {p.unsaved && (
        <div className={`${s.unsaved} ${s[p.mode]}`}>
          <span className="body-strong">{t('unsaved')}</span>
          <Button variant="primary" icon="check" onPress={p.onSave}>
            {t('save')}
          </Button>
        </div>
      )}
    </>
  );
}

/** „Deconectează…”: the danger dialog. */
export function DisconnectStripeDialog(p: {
  mode: ScreenMode;
  framed?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
}) {
  const t = useTranslations('booking.payments');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={p.framed}
      sheet={p.mode === 'mobile'}
      onClose={p.onClose}
      tone="danger"
      title={t('disconnectTitle')}
      description={t('disconnectBody')}
      footer={
        <>
          <Button variant="quiet" onPress={p.onClose}>
            {ui('cancel')}
          </Button>
          <Button variant="danger" onPress={p.onConfirm}>
            {t('disconnect')}
          </Button>
        </>
      }
    />
  );
}
