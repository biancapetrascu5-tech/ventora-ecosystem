'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
import { Button } from '../Button/Button';
import { fmtNumber } from '../lib/fmt';
import styles from './UsageMeter.module.css';

export interface UsageMeterProps {
  label: string;
  used: number;
  limit?: number;
  unit?: string;
  locale?: string;
  format?: (n: number) => string;
  compact?: boolean;
  warnAt?: number;
  onUpgrade?: () => void;
  onBuy?: () => void;
  buyLabel?: string;
  owner?: string;
  onNotifyOwner?: () => void;
  className?: string;
  /** i18n text — no hardcoded defaults */
  unlimitedLabel?: string;
  usedOfLabel?: (args: { used: string; limit: string }) => string;
  leftLabel?: (args: { n: string }) => string;
  nearLimitLabel?: string;
  atLimitLabel?: string;
  atLimitHint?: string;
  upgradeLabel?: string;
  buyMoreLabel?: string;
  notifyOwnerLabel?: string;
  onlyOwnerBuysLabel?: (args: { who: string }) => string;
}

export function UsageMeter({
  label,
  used = 0,
  limit,
  unit,
  locale,
  format,
  compact = false,
  warnAt = 0.8,
  onUpgrade,
  onBuy,
  buyLabel,
  owner,
  onNotifyOwner,
  className,
  unlimitedLabel,
  usedOfLabel,
  leftLabel,
  nearLimitLabel,
  atLimitLabel,
  atLimitHint,
  upgradeLabel,
  buyMoreLabel,
  notifyOwnerLabel,
  onlyOwnerBuysLabel,
}: UsageMeterProps) {
  const f = format ?? ((n: number) => fmtNumber(n, locale));
  const unlimited = limit == null;
  const ratio = unlimited ? 0 : used / limit;
  const state = unlimited ? 'ok' : ratio >= 1 ? 'limit' : ratio >= warnAt ? 'warn' : 'ok';
  const remaining = unlimited ? null : Math.max(0, limit - used);
  const u = unit ? ` ${unit}` : '';
  const usedOf = unlimited ? '' : (usedOfLabel?.({ used: f(used), limit: f(limit) + u }) ?? '');
  const left = remaining == null ? '' : (leftLabel?.({ n: f(remaining) + u }) ?? '');
  const btnSize = compact ? 'sm' : 'md';

  return (
    <div
      className={cn(
        styles.root,
        state === 'warn' && styles.stateWarn,
        state === 'limit' && styles.stateLimit,
        compact && styles.compact,
        className,
      )}
    >
      <div className={styles.top}>
        <span className={compact ? 'caption' : 'subheading'}>{label}</span>
        <span className={cn(compact ? 'caption' : 'body-small', styles.nums)}>
          {unlimited ? unlimitedLabel : usedOf}
        </span>
      </div>
      {!unlimited && (
        <div
          className={styles.bar}
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-valuetext={usedOf}
        >
          <span className={styles.fill} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      )}
      {!compact && !unlimited && state === 'ok' && (
        <p className={cn(styles.msg, 'body-small')}>{left}</p>
      )}
      {!unlimited && state === 'warn' && (
        <p className={cn(styles.msg, styles.msgWarn, 'body-small')}>
          <Icon icon="triangle-alert" size={14} />
          <span>
            {nearLimitLabel} · {left}
          </span>
        </p>
      )}
      {!unlimited && state === 'limit' && (
        <div className={styles.panel}>
          <p className={cn(styles.msg, styles.msgLimit, 'body-small')}>
            <Icon icon="lock" size={14} />
            <span>
              <strong className="body-strong">{atLimitLabel}.</strong>{' '}
              {!compact && (onBuy || onUpgrade) ? atLimitHint : null}
            </span>
          </p>
          {owner && !onBuy && (
            <p className={cn('body-small', styles.who)}>{onlyOwnerBuysLabel?.({ who: owner })}</p>
          )}
          <div className={styles.actions}>
            {onBuy && (
              <Button variant="primary" size={btnSize} icon="plus" onPress={onBuy}>
                {buyLabel ?? buyMoreLabel}
              </Button>
            )}
            {owner && !onBuy && onNotifyOwner && (
              <Button variant="secondary" size={btnSize} icon="send" onPress={onNotifyOwner}>
                {notifyOwnerLabel}
              </Button>
            )}
            {onUpgrade && !compact && (
              <Button variant={onBuy ? 'quiet' : 'primary'} size="md" onPress={onUpgrade}>
                {upgradeLabel}
              </Button>
            )}
          </div>
        </div>
      )}
      {!compact && !unlimited && state === 'warn' && (onBuy || onUpgrade) && (
        <div className={styles.actions}>
          {onBuy && (
            <Button variant="secondary" size="sm" icon="plus" onPress={onBuy}>
              {buyLabel ?? buyMoreLabel}
            </Button>
          )}
          {!onBuy && onUpgrade && (
            <Button variant="secondary" size="sm" onPress={onUpgrade}>
              {upgradeLabel}
            </Button>
          )}
        </div>
      )}
      {!compact && !unlimited && state === 'warn' && owner && !onBuy && (
        <p className={cn('body-small', styles.who)}>{onlyOwnerBuysLabel?.({ who: owner })}</p>
      )}
    </div>
  );
}
