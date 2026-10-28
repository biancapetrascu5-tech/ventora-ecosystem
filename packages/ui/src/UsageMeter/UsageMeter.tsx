'use client';

import { cn } from '../lib/cn';
import { Icon } from '../Icon/Icon';
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

function fmt(n: number, format?: (n: number) => string, locale?: string): string {
  if (format) return format(n);
  return n.toLocaleString(locale);
}

export function UsageMeter({
  label,
  used = 0,
  limit,
  unit,
  locale,
  format,
  compact,
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
  const unlimited = limit === undefined || limit === null;
  const ratio = unlimited ? 0 : used / limit!;
  const state: 'ok' | 'warn' | 'limit' = unlimited
    ? 'ok'
    : ratio >= 1
      ? 'limit'
      : ratio >= warnAt
        ? 'warn'
        : 'ok';
  const remaining = unlimited ? null : Math.max(0, limit! - used);
  const u = unit ? ` ${unit}` : '';
  const f = (n: number) => fmt(n, format, locale);

  const countText = unlimited
    ? (unlimitedLabel ?? '')
    : (usedOfLabel?.({ used: f(used), limit: f(limit!) + u }) ?? `${f(used)}/${f(limit!)}${u}`);

  const pct = Math.min(100, ratio * 100);

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
        <span className={cn(compact ? styles.captionLabel : styles.label)}>{label}</span>
        <span className={cn(styles.count, compact ? styles.countCompact : styles.countBody)}>
          {countText}
        </span>
      </div>
      {!unlimited && (
        <div
          className={styles.track}
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit!)}
        >
          <span className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
      )}
      {!compact && !unlimited && state === 'ok' && remaining !== null && remaining > 0 && (
        <p className={styles.msg}>{leftLabel?.({ n: f(remaining) + u })}</p>
      )}
      {!unlimited && state === 'warn' && (
        <p className={cn(styles.msg, styles.msgWarn)}>
          <Icon icon="triangle-alert" size={14} aria-hidden />
          <span>
            {nearLimitLabel}
            {remaining !== null && leftLabel && ` · ${leftLabel({ n: f(remaining) + u })}`}
          </span>
        </p>
      )}
      {!unlimited && state === 'limit' && (
        <div className={styles.limitPanel}>
          <p className={cn(styles.msg, styles.msgLimit)}>
            <Icon icon="lock" size={14} aria-hidden />
            <span>
              {atLimitLabel && <strong className={styles.limitTitle}>{atLimitLabel}.</strong>}
              {!compact && (onBuy ?? onUpgrade) && atLimitHint && ` ${atLimitHint}`}
            </span>
          </p>
          {owner && !onBuy && onlyOwnerBuysLabel && (
            <p className={styles.who}>{onlyOwnerBuysLabel({ who: owner })}</p>
          )}
          <div className={styles.actions}>
            {onBuy && (
              <button
                type="button"
                className={cn(styles.btn, styles.btnPrimary, compact && styles.btnSm)}
                onClick={onBuy}
              >
                <Icon icon="plus" size={16} aria-hidden />
                <span>{buyLabel ?? buyMoreLabel}</span>
              </button>
            )}
            {owner && !onBuy && onNotifyOwner && notifyOwnerLabel && (
              <button
                type="button"
                className={cn(styles.btn, styles.btnSecondary, compact && styles.btnSm)}
                onClick={onNotifyOwner}
              >
                <Icon icon="send" size={16} aria-hidden />
                <span>{notifyOwnerLabel}</span>
              </button>
            )}
            {onUpgrade && !compact && (
              <button
                type="button"
                className={cn(styles.btn, onBuy ? styles.btnQuiet : styles.btnPrimary)}
                onClick={onUpgrade}
              >
                <span>{upgradeLabel}</span>
              </button>
            )}
          </div>
        </div>
      )}
      {!compact && !unlimited && state === 'warn' && (onBuy ?? onUpgrade) && (
        <div className={styles.actions}>
          {onBuy && (
            <button
              type="button"
              className={cn(styles.btn, styles.btnSecondary, styles.btnSm)}
              onClick={onBuy}
            >
              <Icon icon="plus" size={16} aria-hidden />
              <span>{buyLabel ?? buyMoreLabel}</span>
            </button>
          )}
          {!onBuy && onUpgrade && upgradeLabel && (
            <button
              type="button"
              className={cn(styles.btn, styles.btnSecondary, styles.btnSm)}
              onClick={onUpgrade}
            >
              <span>{upgradeLabel}</span>
            </button>
          )}
        </div>
      )}
      {!compact && !unlimited && state === 'warn' && owner && !onBuy && onlyOwnerBuysLabel && (
        <p className={styles.who}>{onlyOwnerBuysLabel({ who: owner })}</p>
      )}
    </div>
  );
}
