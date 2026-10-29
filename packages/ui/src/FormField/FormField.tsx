'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './FormField.module.css';

export interface FormFieldProps {
  label: ReactNode;
  children:
    | ReactNode
    | ((props: {
        id: string;
        isInvalid: boolean;
        'aria-describedby'?: string;
        'aria-required'?: boolean;
      }) => ReactNode);
  /** Textul de ajutor de sub câmp (helper în design). */
  hint?: ReactNode;
  error?: ReactNode;
  /** @deprecated use isRequired */
  required?: boolean;
  isRequired?: boolean;
  /** „(opțional)” după etichetă; textul vine din `optionalLabel`. */
  isOptional?: boolean;
  /** Textul pentru cititorul de ecran după „*” (S.required), ex. „obligatoriu”. */
  requiredLabel?: string;
  /** Textul afișat pentru câmpurile opționale (S.optional), ex. „opțional”. */
  optionalLabel?: string;
  /** Eticheta doar pentru cititorul de ecran. */
  labelHidden?: boolean;
  /** Contorul din dreapta etichetei (ex. Textarea showCount). */
  counter?: ReactNode;
  id?: string;
  className?: string;
}

/* FormField din bundle.js (.v-formfield): eticheta caption, „ *” danger-ink, eroare cu circle-alert 14px. */
export function FormField({
  label,
  children,
  hint,
  error,
  required,
  isRequired,
  isOptional,
  requiredLabel,
  optionalLabel,
  labelHidden,
  counter,
  id: idProp,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const id = idProp ?? 'f' + generatedId.replace(/:/g, '');
  const hintId = `${id}-help`;
  const errorId = `${id}-err`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const isInvalid = Boolean(error);
  const req = Boolean(required || isRequired);

  const childProps = {
    id,
    isInvalid,
    'aria-describedby': describedBy,
    'aria-required': req || undefined,
  };

  let content: ReactNode;
  if (typeof children === 'function') {
    content = children(childProps);
  } else if (isValidElement(children) && typeof children.type !== 'string') {
    // Ca în bundle: id, aria-describedby și starea de eroare ajung direct la controlul din interior.
    const child = children as ReactElement<Record<string, unknown>>;
    content = cloneElement(child, {
      id: child.props.id ?? id,
      'aria-describedby': describedBy,
      isInvalid: isInvalid || child.props.isInvalid,
      'aria-required': req || child.props['aria-required'],
    });
  } else {
    content = children;
  }

  return (
    <div className={cn(styles.root, error ? styles.isError : undefined, className)}>
      <div className={styles.top}>
        <label htmlFor={id} className={cn(styles.label, 'caption', labelHidden && styles.sr)}>
          {label}
          {req && (
            <span className={styles.req} aria-hidden="true">
              {' *'}
            </span>
          )}
          {req && requiredLabel && <span className={styles.sr}>{` (${requiredLabel})`}</span>}
          {isOptional && !req && optionalLabel && (
            <span className={styles.opt}>{` (${optionalLabel})`}</span>
          )}
        </label>
        {counter}
      </div>
      {content}
      {error ? (
        <p id={errorId} className={cn(styles.error, 'caption')} role="alert">
          <Icon icon="circle-alert" size={14} className={styles.errorIcon} />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className={cn(styles.hint, 'caption')}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
