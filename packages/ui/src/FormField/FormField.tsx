'use client';

import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../lib/cn';
import styles from './FormField.module.css';

export interface FormFieldProps {
  label: string;
  children:
    | React.ReactNode
    | ((props: {
        id: string;
        isInvalid: boolean;
        'aria-describedby'?: string;
        'aria-required'?: boolean;
      }) => React.ReactNode);
  hint?: string;
  error?: string;
  /** @deprecated use isRequired */
  required?: boolean;
  isRequired?: boolean;
  id?: string;
  className?: string;
}

export function FormField({
  label,
  children,
  hint,
  error,
  required,
  isRequired,
  id: idProp,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const isInvalid = Boolean(error);
  const showRequired = required || isRequired;

  const childProps = {
    id,
    isInvalid,
    'aria-describedby': describedBy,
    'aria-required': showRequired || undefined,
  };

  return (
    <div className={cn(styles.root, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {showRequired && (
          <span className={styles.required} aria-hidden>
            *
          </span>
        )}
      </label>
      {typeof children === 'function' ? children(childProps) : children}
      {hint && !error && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          <AlertCircle size={12} strokeWidth={2} className={styles.errorIcon} aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}
