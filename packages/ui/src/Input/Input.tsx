'use client';

import { useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Input.module.css';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  isInvalid?: boolean;
  iconStart?: IconName;
  iconEnd?: IconName;
  prefix?: ReactNode;
  suffix?: ReactNode;
  clearLabel?: string;
  onClear?: () => void;
}

export function Input({
  isInvalid,
  iconStart,
  iconEnd,
  prefix,
  suffix,
  clearLabel,
  onClear,
  className,
  ...props
}: InputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const wrapperClass = cn(
    styles.wrapper,
    isInvalid && styles.invalid,
    iconStart && styles.hasIconStart,
    (iconEnd || onClear) && styles.hasIconEnd,
    prefix && styles.hasPrefix,
    suffix && styles.hasSuffix,
  );

  return (
    <div className={wrapperClass}>
      {prefix && <span className={styles.prefix}>{prefix}</span>}

      {iconStart && (
        <span className={styles.iconStart} aria-hidden>
          <Icon icon={iconStart} size="sm" />
        </span>
      )}

      <input
        ref={inputRef}
        aria-invalid={isInvalid || undefined}
        className={cn(styles.root, className)}
        {...props}
      />

      {onClear && props.value ? (
        <button
          type="button"
          aria-label={clearLabel ?? 'Șterge'}
          className={styles.clearButton}
          onClick={() => {
            onClear();
            inputRef.current?.focus();
          }}
          tabIndex={-1}
        >
          <Icon icon="x" size="sm" aria-hidden />
        </button>
      ) : (
        iconEnd && (
          <span className={styles.iconEnd} aria-hidden>
            <Icon icon={iconEnd} size="sm" />
          </span>
        )
      )}

      {suffix && <span className={styles.suffix}>{suffix}</span>}
    </div>
  );
}
