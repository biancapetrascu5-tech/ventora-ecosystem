'use client';

import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import styles from './Input.module.css';

export interface InputLabels {
  /** Butonul care golește câmpul (S.clear). */
  clear?: string;
  /** Comutatorul de parolă (S.showPassword / S.hidePassword). */
  showPassword?: string;
  hidePassword?: string;
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** sm = 28px (.v-control--sm), md = 36px, lg = 44px. */
  size?: 'sm' | 'md' | 'lg';
  isInvalid?: boolean;
  /** Iconița de 16px de la început (.v-control__icon). */
  icon?: IconName;
  /** @deprecated folosește `icon`. */
  iconStart?: IconName;
  /** Iconiță de 16px după câmp. */
  iconEnd?: IconName;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Spinner după câmp (aria-busy). */
  isLoading?: boolean;
  /** Buton de golire când câmpul are valoare. */
  clearable?: boolean;
  onClear?: () => void;
  /** @deprecated folosește `labels.clear`. */
  clearLabel?: string;
  labels?: InputLabels;
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
}

/* Input din bundle.js: .v-control cu bordura pe container; câmpul (.v-control__input) e transparent. */
export function Input({
  size = 'md',
  isInvalid,
  icon,
  iconStart,
  iconEnd,
  prefix,
  suffix,
  isLoading,
  clearable,
  onClear,
  clearLabel,
  labels,
  state,
  className,
  type = 'text',
  value,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  ...props
}: InputProps) {
  const [show, setShow] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? '');
  const v = value !== undefined ? value : inner;
  const isPwd = type === 'password';
  const startIcon = icon ?? iconStart;
  const canClear = (clearable || onClear) && v !== '' && v != null && !disabled && !readOnly;

  return (
    <div
      className={cn(
        styles.control,
        styles[size],
        isInvalid && styles.isError,
        disabled && styles.isDisabled,
        readOnly && styles.isReadonly,
        forced(styles, state),
        className,
      )}
    >
      {startIcon && <Icon icon={startIcon} size={16} className={styles.icon} />}
      {prefix && <span className={cn(styles.affix, 'body-small')}>{prefix}</span>}
      <input
        className={cn(styles.input, 'body')}
        type={isPwd && show ? 'text' : type}
        value={v}
        onChange={(e) => {
          if (value === undefined) setInner(e.target.value);
          onChange?.(e);
        }}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={isInvalid || undefined}
        aria-busy={isLoading || undefined}
        {...props}
      />
      {suffix && <span className={cn(styles.affix, 'body-small')}>{suffix}</span>}
      {iconEnd && <Icon icon={iconEnd} size={16} className={styles.icon} />}
      {isLoading && (
        <span className={styles.spinner} style={{ width: 16, height: 16 }}>
          <Icon icon="loader-circle" size={16} />
        </span>
      )}
      {canClear && (
        <button
          type="button"
          className={styles.btn}
          aria-label={labels?.clear ?? clearLabel}
          onClick={() => {
            if (value === undefined) setInner('');
            onClear?.();
          }}
        >
          <Icon icon="x" size={14} />
        </button>
      )}
      {isPwd && (
        <button
          type="button"
          className={styles.btn}
          aria-label={show ? labels?.hidePassword : labels?.showPassword}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
          disabled={disabled}
        >
          <Icon icon={show ? 'eye-off' : 'eye'} size={16} />
        </button>
      )}
    </div>
  );
}
