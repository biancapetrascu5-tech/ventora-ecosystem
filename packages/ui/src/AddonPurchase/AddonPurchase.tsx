'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import { Dialog } from '../Dialog/Dialog';
import { Icon, type IconName } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { cn } from '../lib/cn';
import { fmtNumber } from '../lib/fmt';
import { Notice } from '../Notice/Notice';
import type { UsageMeterProps } from '../UsageMeter/UsageMeter';
import {
  PayError,
  PayErrorActions,
  PaymentCard,
  PayProcessing,
  PaySuccess,
  StripeSlot,
  type PaymentCardData,
  type PaymentLabels,
  type PayUsage,
} from './Payment';
import styles from './AddonPurchase.module.css';

export interface AddonPurchaseLabels extends PaymentLabels {
  /** S.processing / S.paySuccess / S.payFailed — titlurile stărilor. */
  processing: string;
  paySuccess: string;
  /** S.payAmount, ex. (amount) => `Plătește ${amount}`. */
  payAmount: (amount: string) => string;
  done: string;
  cancel: string;
  quantity: string;
  decrease: string;
  increase: string;
  total: string;
  finalPrice: string;
  payWith: string;
  cardExpiring: string;
  noCardSaved: string;
  /** S.close — „x” din dialog. */
  close: string;
}

export interface AddonData {
  name: string;
  /** Titlul dialogului (implicit `name`). */
  title?: string;
  description?: string;
  price: number;
  icon?: IconName;
  /** Cantitatea maximă (implicit 20). */
  max?: number;
  /** Rândul de sub „Total” (implicit labels.finalPrice). */
  note?: string;
}

export interface AddonPurchaseProps {
  addon: AddonData;
  state?: 'review' | 'processing' | 'success' | 'error';
  quantity?: number;
  defaultQuantity?: number;
  onQuantityChange?: (q: number) => void;
  /** Cardul salvat; `null` = fără card (apare locul pentru formularul Stripe). */
  card?: PaymentCardData | null;
  onChangeCard?: () => void;
  /** Formularul Stripe, în locul textului de rezervă. */
  cardSlot?: ReactNode;
  cardExpiring?: boolean;
  error?: { title?: string; message?: string };
  usage?: PayUsage;
  invoice?: { number: string; onOpen?: () => void };
  onPay?: (quantity: number, total: number) => void;
  onRetry?: () => void;
  onUseOtherCard?: () => void;
  onDone?: () => void;
  doneLabel?: string;
  /** Închide dialogul (Renunță, „x”, Gata). */
  onClose?: () => void;
  /** Panoul fără fereastră modală. */
  inline?: boolean;
  /** Foaie de jos pe telefon. */
  sheet?: boolean;
  currency?: string;
  format?: (n: number) => string;
  locale?: string;
  labels: AddonPurchaseLabels;
  /** Textele UsageMeter (usedOfLabel…) pentru comparația de după plată. */
  usageLabels?: Partial<UsageMeterProps>;
}

/* AddonPurchase din bundle.js: pachetul în plus — confirmare (cantitate, total, cardul),
   se procesează, reușită (limita înainte / acum, factura), eroare (ce poți face). */
export function AddonPurchase({
  addon,
  state = 'review',
  quantity,
  defaultQuantity = 1,
  onQuantityChange,
  card,
  onChangeCard,
  cardSlot,
  cardExpiring,
  error,
  usage,
  invoice,
  onPay,
  onRetry,
  onUseOtherCard,
  onDone,
  doneLabel,
  onClose,
  inline = true,
  sheet,
  currency = 'lei',
  format,
  locale,
  labels,
  usageLabels,
}: AddonPurchaseProps) {
  const [inner, setInner] = useState(defaultQuantity);
  const max = addon.max ?? 20;
  const q = quantity ?? inner;
  const setQ = (n: number) => {
    const v = Math.max(1, Math.min(max, n));
    if (quantity == null) setInner(v);
    onQuantityChange?.(v);
  };
  const money = format ?? ((n: number) => `${fmtNumber(n, locale)} ${currency}`);
  const total = (addon.price ?? 0) * q;

  const addonRow = (full?: boolean) => (
    <div className={cn(styles.addon, full && styles.addonFull)}>
      <span className={styles.addonIcon} aria-hidden="true">
        <Icon icon={addon.icon ?? 'package'} size={20} />
      </span>
      <span className={styles.addonText}>
        <span className="body-strong">{addon.name}</span>
        {addon.description && (
          <span className={cn('body-small', styles.desc)}>{addon.description}</span>
        )}
      </span>
      <span className={cn('body-strong', 'v-num', styles.price)}>{money(addon.price ?? 0)}</span>
    </div>
  );

  let title: string;
  let body: ReactNode;
  let footer: ReactNode;
  let icon: IconName | undefined;
  let tone: 'default' | 'done' | 'danger' = 'default';

  if (state === 'processing') {
    title = labels.processing;
    body = <PayProcessing hint={labels.processingHint}>{addonRow(true)}</PayProcessing>;
    footer = (
      <Button variant="primary" isPending>
        {labels.payAmount(money(total))}
      </Button>
    );
  } else if (state === 'success') {
    title = labels.paySuccess;
    icon = 'circle-check';
    tone = 'done';
    body = <PaySuccess usage={usage} invoice={invoice} labels={labels} usageLabels={usageLabels} />;
    footer = (
      <Button variant="primary" onPress={onDone ?? onClose}>
        {doneLabel ?? labels.done}
      </Button>
    );
  } else if (state === 'error') {
    title = labels.payFailed;
    icon = 'circle-alert';
    tone = 'danger';
    body = <PayError error={error} card={card} labels={labels} />;
    footer = <PayErrorActions onUseOtherCard={onUseOtherCard} onRetry={onRetry} labels={labels} />;
  } else {
    title = addon.title ?? addon.name;
    body = (
      <>
        {addonRow()}
        <div className={styles.payline}>
          <span className="subheading">{labels.quantity}</span>
          <span className={styles.stepper} role="group" aria-label={labels.quantity}>
            <IconButton
              variant="secondary"
              icon="minus"
              label={labels.decrease}
              onPress={() => setQ(q - 1)}
              isDisabled={q <= 1}
            />
            <output className={cn(styles.value, 'body-strong', 'v-num')} aria-live="polite">
              {q}
            </output>
            <IconButton
              variant="secondary"
              icon="plus"
              label={labels.increase}
              onPress={() => setQ(q + 1)}
              isDisabled={q >= max}
            />
          </span>
        </div>
        <div className={cn(styles.payline, styles.paylineTotal)}>
          <span>
            <span className="subheading">{labels.total}</span>
            <span className={cn('body-small', styles.note)}>{addon.note ?? labels.finalPrice}</span>
          </span>
          <span className="numeric v-num">{money(total)}</span>
        </div>
        <div className={styles.paywith}>
          <span className={cn('caption', styles.lab)}>{labels.payWith}</span>
          {card && cardExpiring && (
            <Notice tone="attention" icon="credit-card">
              {labels.cardExpiring}
            </Notice>
          )}
          {card ? (
            <PaymentCard card={card} onChange={onChangeCard} labels={labels} />
          ) : (
            <>
              <p className={cn('body-small', styles.none)}>{labels.noCardSaved}</p>
              <StripeSlot labels={labels}>{cardSlot}</StripeSlot>
            </>
          )}
        </div>
      </>
    );
    footer = (
      <>
        <Button variant="secondary" onPress={onClose}>
          {labels.cancel}
        </Button>
        <Button variant="primary" icon="lock" onPress={() => onPay?.(q, total)}>
          {labels.payAmount(money(total))}
        </Button>
      </>
    );
  }

  return (
    <Dialog
      inline={inline}
      sheet={sheet}
      title={title}
      icon={icon}
      tone={tone}
      isDismissable={state !== 'processing'}
      closeLabel={labels.close}
      onClose={onClose}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}
