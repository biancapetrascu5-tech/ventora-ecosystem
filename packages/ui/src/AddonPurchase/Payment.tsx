'use client';

import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { Notice } from '../Notice/Notice';
import { UsageMeter, type UsageMeterProps } from '../UsageMeter/UsageMeter';
import btn from '../Button/Button.module.css';
import styles from './Payment.module.css';

/* Piesele de plată din bundle.js (PaymentCard, StripeSlot, PayProcessing, PaySuccess, PayError,
   PayErrorActions), folosite de AddonPurchase și UpgradeDialog. */

export interface PaymentCardData {
  brand: string;
  last4: string;
  expiry?: string;
}

export interface PaymentLabels {
  /** S.expires, ex. (date) => `expiră ${date}`. */
  expires: (date: string) => string;
  changeCard: string;
  stripeSlot: string;
  saveCard: string;
  processingHint: string;
  paySuccessHint: string;
  before: string;
  after: string;
  /** S.invoiceIssued, ex. (nr) => `Am emis factura ${nr}`. */
  invoiceIssued: (nr: string) => string;
  seeInvoice: string;
  payFailed: string;
  noMoneyTaken: string;
  whatYouCanDo: string;
  tryAgain: string;
  useOtherCard: string;
  callBank: string;
}

export function PaymentCard({
  card,
  onChange,
  compact,
  labels,
}: {
  card?: PaymentCardData | null;
  onChange?: () => void;
  compact?: boolean;
  labels: Pick<PaymentLabels, 'expires' | 'changeCard'>;
}) {
  if (!card) return null;
  return (
    <div className={cn(styles.paycard, compact && styles.paycardCompact)}>
      <span className={cn(styles.brand, 'caption')} aria-hidden="true">
        {card.brand}
      </span>
      <span className={styles.paycardText}>
        <span className="body-strong v-num">{`${card.brand} •••• ${card.last4}`}</span>
        {card.expiry && (
          <span className={cn('body-small', styles.meta)}>{labels.expires(card.expiry)}</span>
        )}
      </span>
      {onChange && (
        <button
          type="button"
          className={cn(btn.root, btn.quiet, btn.sm, styles.hover)}
          onClick={onChange}
        >
          <span className={cn(btn.label, 'body-strong')}>{labels.changeCard}</span>
        </button>
      )}
    </div>
  );
}

export function StripeSlot({
  children,
  saveCard = true,
  onSaveCardChange,
  labels,
}: {
  children?: ReactNode;
  saveCard?: boolean;
  onSaveCardChange?: (save: boolean) => void;
  labels: Pick<PaymentLabels, 'stripeSlot' | 'saveCard'>;
}) {
  return (
    <div className={styles.stripe}>
      <div className={styles.stripeFrame}>
        {children ?? (
          <span className={cn(styles.placeholder, 'body-small')}>
            <Icon icon="lock" size={16} />
            {labels.stripeSlot}
          </span>
        )}
      </div>
      <label className={cn(styles.save, 'body-small')}>
        <input
          type="checkbox"
          defaultChecked={saveCard}
          onChange={(e) => onSaveCardChange?.(e.target.checked)}
        />
        {labels.saveCard}
      </label>
    </div>
  );
}

export function PayProcessing({ children, hint }: { children?: ReactNode; hint: string }) {
  return (
    <div className={styles.paystate}>
      <span className={cn(styles.spinner, styles.spin)}>
        <Icon icon="loader-circle" size={32} />
      </span>
      <p className={cn('body', styles.hint)}>{hint}</p>
      {children}
    </div>
  );
}

export interface PayUsage {
  label: string;
  used: number;
  limitBefore: number;
  limitAfter: number;
  unit?: string;
}

export function PaySuccess({
  hint,
  usage,
  invoice,
  children,
  labels,
  usageLabels,
}: {
  hint?: ReactNode;
  usage?: PayUsage;
  invoice?: { number: string; onOpen?: () => void };
  children?: ReactNode;
  labels: Pick<
    PaymentLabels,
    'paySuccessHint' | 'before' | 'after' | 'invoiceIssued' | 'seeInvoice'
  >;
  /** Textele UsageMeter (usedOfLabel…) pentru comparație. */
  usageLabels?: Partial<UsageMeterProps>;
}) {
  return (
    <>
      <p className={cn('body', styles.hint)}>{hint ?? labels.paySuccessHint}</p>
      {usage && (
        <div className={styles.compare}>
          <div>
            <span className={cn('caption', styles.lab)}>{labels.before}</span>
            <UsageMeter
              {...usageLabels}
              compact
              neutral
              label={usage.label}
              used={usage.used}
              limit={usage.limitBefore}
              unit={usage.unit}
            />
          </div>
          <div>
            <span className={cn('caption', styles.lab)}>{labels.after}</span>
            <UsageMeter
              {...usageLabels}
              compact
              neutral
              label={usage.label}
              used={usage.used}
              limit={usage.limitAfter}
              unit={usage.unit}
            />
          </div>
        </div>
      )}
      {children}
      {invoice && (
        <div className={styles.invoice}>
          <Icon icon="receipt" size={16} />
          <span className="body-small">{labels.invoiceIssued(invoice.number)}</span>
          <button type="button" className={cn(styles.link, 'body-small')} onClick={invoice.onOpen}>
            {labels.seeInvoice}
          </button>
        </div>
      )}
    </>
  );
}

export function PayError({
  error,
  card,
  labels,
}: {
  error?: { title?: string; message?: string };
  card?: PaymentCardData | null;
  labels: PaymentLabels;
}) {
  return (
    <>
      <Notice tone="danger" title={error?.title ?? labels.payFailed}>
        {error?.message ?? ''} {labels.noMoneyTaken}
      </Notice>
      <div>
        <p className="subheading">{labels.whatYouCanDo}</p>
        <ul className={cn(styles.todo, 'body-small')}>
          <li>{labels.tryAgain}</li>
          <li>{labels.useOtherCard}</li>
          <li>{labels.callBank}</li>
        </ul>
      </div>
      {card && <PaymentCard card={card} compact labels={labels} />}
    </>
  );
}

export function PayErrorActions({
  onUseOtherCard,
  onRetry,
  labels,
}: {
  onUseOtherCard?: () => void;
  onRetry?: () => void;
  labels: Pick<PaymentLabels, 'useOtherCard' | 'tryAgain'>;
}) {
  return (
    <>
      <button
        type="button"
        className={cn(btn.root, btn.secondary, btn.md, styles.hover)}
        onClick={onUseOtherCard}
      >
        <Icon icon="credit-card" size={16} />
        <span className={cn(btn.label, 'body-strong')}>{labels.useOtherCard}</span>
      </button>
      <button type="button" className={cn(btn.root, btn.primary, btn.md)} onClick={onRetry}>
        <Icon icon="rotate-ccw" size={16} />
        <span className={cn(btn.label, 'body-strong')}>{labels.tryAgain}</span>
      </button>
    </>
  );
}
