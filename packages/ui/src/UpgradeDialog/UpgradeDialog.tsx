'use client';

import { useId, useState, type ReactNode } from 'react';
import { RadioGroup as RACRadioGroup } from 'react-aria-components';
import {
  PayError,
  PayErrorActions,
  PaymentCard,
  PayProcessing,
  PaySuccess,
  StripeSlot,
} from '../AddonPurchase/Payment';
import type { PaymentCardData, PaymentLabels, PayUsage } from '../AddonPurchase/Payment';
import { Button } from '../Button/Button';
import { Dialog } from '../Dialog/Dialog';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { Notice } from '../Notice/Notice';
import { Radio } from '../Radio/Radio';
import { UsageMeter, type UsageMeterProps } from '../UsageMeter/UsageMeter';
import styles from './UpgradeDialog.module.css';

export interface UpgradeLabels extends PaymentLabels {
  chooseOption: string;
  nothingLost: string;
  /** S.decides, ex. (who) => `Ajunge la ${who}.` */
  decides: (who: string) => string;
  /** S.recommendSent, ex. (who) => `Am trimis recomandarea către ${who}.` */
  recommendSent: (who: string) => string;
  recommendSend: string;
  cancel: string;
  continueBtn: string;
  close: string;
  back: string;
  youActivate: string;
  whenLabel: string;
  priceLabel: string;
  setupCost: string;
  noneCost: string;
  payToday: string;
  planRequestNote: string;
  trialNoCard: string;
  /** S.upgrade — butonul cererii de abonament. */
  upgrade: string;
  startTrial: string;
  activating: string;
  processing: string;
  paySuccess: string;
  trialActive: string;
  done: string;
  /** S.payAmount, ex. (amount) => `Plătește ${amount}`. */
  payAmount: (amount: string) => string;
  payWith: string;
  noCardSaved: string;
}

export interface UpgradeOption {
  id: string;
  /** pack = pachet plătit acum; plan = cerere de abonament; trial = perioadă de probă. */
  kind: 'pack' | 'plan' | 'trial';
  title: string;
  price?: string;
  includes?: string[];
}

export interface UpgradeSummary {
  what?: string;
  when?: string;
  price?: string;
  setup?: string;
  total?: string;
}

export interface UpgradeDialogProps {
  step?: 'options' | 'confirm' | 'processing' | 'success' | 'error' | 'trial';
  title?: string;
  description?: ReactNode;
  /** Limita atinsă, afișată ca UsageMeter compact. */
  usage?: { label: string; used: number; limit?: number; unit?: string };
  options?: UpgradeOption[];
  value?: string;
  onChange?: (id: string) => void;
  /** owner alege și plătește; member vede variantele și cine decide. */
  role?: 'owner' | 'member';
  decider?: string;
  onRecommend?: () => void;
  recommended?: boolean;
  summary?: UpgradeSummary;
  card?: PaymentCardData | null;
  cardSlot?: ReactNode;
  error?: { title?: string; message?: string };
  success?: {
    title?: string;
    hint?: ReactNode;
    usage?: PayUsage;
    invoice?: { number: string; onOpen?: () => void };
  };
  trial?: { text: ReactNode; reminder?: ReactNode };
  onContinue?: (id: string) => void;
  onBack?: () => void;
  onPay?: () => void;
  onRetry?: () => void;
  onUseOtherCard?: () => void;
  onDone?: () => void;
  doneLabel?: string;
  /** Închide dialogul (Renunță, Închide, „x”). */
  onClose?: () => void;
  /** Panoul fără fereastră modală. */
  inline?: boolean;
  /** Foaie de jos pe telefon. */
  sheet?: boolean;
  labels: UpgradeLabels;
  /** Textele UsageMeter (usedOfLabel…). */
  usageLabels?: Partial<UsageMeterProps>;
}

/* UpgradeDialog din bundle.js: limita atinsă → variante (pachet, abonament, probă), confirmare,
   se procesează, reușită, perioadă de probă începută, eroare. Membrul vede variantele și cine decide. */
export function UpgradeDialog({
  step = 'options',
  title,
  description,
  usage,
  options = [],
  value,
  onChange,
  role = 'owner',
  decider,
  onRecommend,
  recommended = false,
  summary,
  card,
  cardSlot,
  error,
  success,
  trial,
  onContinue,
  onBack,
  onPay,
  onRetry,
  onUseOtherCard,
  onDone,
  doneLabel,
  onClose,
  inline = true,
  sheet,
  labels,
  usageLabels,
}: UpgradeDialogProps) {
  const legendId = useId();
  const [inner, setInner] = useState(value ?? options[0]?.id);
  const sel = value ?? inner;
  const pick = (id: string) => {
    if (value == null) setInner(id);
    onChange?.(id);
  };
  const chosen = options.find((o) => o.id === sel) ?? options[0];
  const isTrial = chosen?.kind === 'trial';
  const isPlan = chosen?.kind === 'plan';
  const owner = role === 'owner';

  let dTitle = title ?? '';
  let body: ReactNode;
  let footer: ReactNode;
  let icon: IconName | undefined;
  let tone: 'default' | 'done' | 'danger' = 'default';
  let dismissible = true;

  const includes = (o: UpgradeOption) =>
    o.includes && o.includes.length > 0 ? (
      <ul className={cn(styles.inc, 'body-small')}>
        {o.includes.map((x) => (
          <li key={x}>
            <Icon icon="check" size={14} />
            {x}
          </li>
        ))}
      </ul>
    ) : null;

  const safe = (ic: IconName, text: ReactNode) => (
    <p className={cn('body-small', styles.safe)}>
      <Icon icon={ic} size={14} />
      {text}
    </p>
  );

  if (step === 'options') {
    const list = options.map((o) => (
      <div
        key={o.id}
        className={cn(styles.opt, owner ? sel === o.id && styles.optOn : styles.optStatic)}
      >
        {owner ? (
          <Radio value={o.id} description={o.price}>
            {o.title}
          </Radio>
        ) : (
          <div className={styles.static}>
            <span className="body-strong">{o.title}</span>
            {o.price && <span className={cn('body-small', styles.price)}>{o.price}</span>}
          </div>
        )}
        {includes(o)}
      </div>
    ));
    const legend = (
      <legend id={legendId} className="subheading">
        {labels.chooseOption}
      </legend>
    );
    body = (
      <>
        {description && <p className={cn('body', styles.desc)}>{description}</p>}
        {usage && (
          <div className={styles.usage}>
            <UsageMeter
              {...usageLabels}
              compact
              label={usage.label}
              used={usage.used}
              limit={usage.limit}
              unit={usage.unit}
            />
          </div>
        )}
        {owner ? (
          <RACRadioGroup
            value={sel ?? null}
            onChange={pick}
            aria-labelledby={legendId}
            className={styles.contents}
          >
            <fieldset className={styles.opts}>
              {legend}
              {list}
            </fieldset>
          </RACRadioGroup>
        ) : (
          <fieldset className={styles.opts}>
            {legend}
            {list}
          </fieldset>
        )}
        {safe('shield', labels.nothingLost)}
        {!owner && decider && !recommended && (
          <p className={cn('body-small', styles.decider)}>{labels.decides(decider)}</p>
        )}
        {!owner && recommended && (
          <Notice tone="done" icon="check">
            {labels.recommendSent(decider ?? '')}
          </Notice>
        )}
      </>
    );
    footer = owner ? (
      <>
        <Button variant="secondary" onPress={onClose}>
          {labels.cancel}
        </Button>
        <Button variant="primary" onPress={() => sel != null && onContinue?.(sel)}>
          {labels.continueBtn}
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onPress={onClose}>
          {labels.close}
        </Button>
        {!recommended && (
          <Button variant="primary" icon="send" onPress={onRecommend}>
            {labels.recommendSend}
          </Button>
        )}
      </>
    );
  } else if (step === 'confirm') {
    const s = summary ?? {};
    body = (
      <>
        <dl className={styles.sum}>
          <div>
            <dt className="caption">{labels.youActivate}</dt>
            <dd className="body-strong">{s.what ?? chosen?.title}</dd>
          </div>
          {s.when && (
            <div>
              <dt className="caption">{labels.whenLabel}</dt>
              <dd className="body">{s.when}</dd>
            </div>
          )}
          <div>
            <dt className="caption">{labels.priceLabel}</dt>
            <dd className="body v-num">{s.price ?? chosen?.price}</dd>
          </div>
          <div>
            <dt className="caption">{labels.setupCost}</dt>
            <dd className="body v-num">{s.setup ?? labels.noneCost}</dd>
          </div>
          {!isTrial && !isPlan && s.total && (
            <div className={styles.total}>
              <dt className="subheading">{labels.payToday}</dt>
              <dd className="numeric v-num">{s.total}</dd>
            </div>
          )}
        </dl>
        {isPlan ? (
          safe('info', labels.planRequestNote)
        ) : isTrial ? (
          safe('info', labels.trialNoCard)
        ) : (
          <div className={styles.paywith}>
            <span className={cn('caption', styles.lab)}>{labels.payWith}</span>
            {card ? (
              <PaymentCard card={card} labels={labels} />
            ) : (
              <>
                <p className={cn('body-small', styles.none)}>{labels.noCardSaved}</p>
                <StripeSlot labels={labels}>{cardSlot}</StripeSlot>
              </>
            )}
          </div>
        )}
      </>
    );
    footer = (
      <>
        <Button variant="secondary" icon="arrow-left" onPress={onBack}>
          {labels.back}
        </Button>
        {isPlan ? (
          <Button variant="primary" icon="send" onPress={onPay}>
            {labels.upgrade}
          </Button>
        ) : isTrial ? (
          <Button variant="primary" onPress={onPay}>
            {labels.startTrial}
          </Button>
        ) : (
          <Button variant="primary" icon="lock" onPress={onPay}>
            {labels.payAmount(s.total ?? '')}
          </Button>
        )}
      </>
    );
  } else if (step === 'processing') {
    dTitle = isTrial ? labels.activating : labels.processing;
    dismissible = false;
    body = <PayProcessing hint={labels.processingHint} />;
    footer = (
      <Button variant="primary" isPending>
        {isTrial ? labels.startTrial : labels.payAmount(summary?.total ?? '')}
      </Button>
    );
  } else if (step === 'success') {
    dTitle = success?.title ?? labels.paySuccess;
    icon = 'circle-check';
    tone = 'done';
    body = (
      <PaySuccess
        hint={success?.hint}
        usage={success?.usage}
        invoice={success?.invoice}
        labels={labels}
        usageLabels={usageLabels}
      />
    );
    footer = (
      <Button variant="primary" onPress={onDone ?? onClose}>
        {doneLabel ?? labels.done}
      </Button>
    );
  } else if (step === 'trial') {
    dTitle = labels.trialActive;
    icon = 'circle-check';
    tone = 'done';
    body = (
      <>
        <p className="body">{trial?.text}</p>
        {trial?.reminder && safe('bell', trial.reminder)}
      </>
    );
    footer = (
      <>
        <Button variant="secondary" onPress={onClose}>
          {labels.done}
        </Button>
        <Button variant="primary" onPress={onDone}>
          {doneLabel}
        </Button>
      </>
    );
  } else {
    dTitle = labels.payFailed;
    icon = 'circle-alert';
    tone = 'danger';
    body = <PayError error={error} card={card} labels={labels} />;
    footer = <PayErrorActions onUseOtherCard={onUseOtherCard} onRetry={onRetry} labels={labels} />;
  }

  return (
    <Dialog
      inline={inline}
      sheet={sheet}
      title={dTitle}
      icon={icon}
      tone={tone}
      isDismissable={dismissible}
      closeLabel={labels.close}
      onClose={onClose}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}
