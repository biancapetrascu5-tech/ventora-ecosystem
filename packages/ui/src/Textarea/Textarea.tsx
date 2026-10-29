'use client';

import { useEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import control from '../Input/Input.module.css';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInvalid?: boolean;
  noResize?: boolean;
  /** Contorul „{n} din {max} caractere” sub câmp; cere `maxLength` și `countLabel`. */
  showCount?: boolean;
  /** Textul contorului (S.characters), ex. (n, max) => `${n} din ${max} caractere`. */
  countLabel?: (n: number, max: number) => string;
  /** Crește odată cu textul. */
  autoGrow?: boolean;
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
}

/* Textarea din bundle.js: .v-control.v-control--area, câmpul .v-control__input și contorul .v-control__count. */
export function Textarea({
  isInvalid,
  noResize,
  showCount,
  countLabel,
  autoGrow,
  state,
  className,
  rows = 4,
  maxLength,
  value,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  ...props
}: TextareaProps) {
  const [inner, setInner] = useState(String(defaultValue ?? ''));
  const v = value !== undefined ? String(value) : inner;
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [v, autoGrow]);

  return (
    <div
      className={cn(
        control.control,
        styles.area,
        isInvalid && control.isError,
        disabled && control.isDisabled,
        readOnly && control.isReadonly,
        forced(control, state),
        className,
      )}
    >
      <textarea
        ref={ref}
        rows={rows}
        className={cn(control.input, styles.input, noResize && styles.noResize, 'body')}
        value={v}
        maxLength={maxLength}
        onChange={(e) => {
          if (value === undefined) setInner(e.target.value);
          onChange?.(e);
        }}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={isInvalid || undefined}
        {...props}
      />
      {showCount && maxLength != null && countLabel && (
        <span className={cn(styles.count, 'caption')} aria-live="polite">
          {countLabel(v.length, maxLength)}
        </span>
      )}
    </div>
  );
}
