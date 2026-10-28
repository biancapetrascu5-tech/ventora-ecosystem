'use client';

import { useId } from 'react';
import {
  Radio as RACRadio,
  RadioGroup as RACRadioGroup,
  type RadioProps as RACRadioProps,
  type RadioGroupProps as RACRadioGroupProps,
} from 'react-aria-components';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import styles from './Radio.module.css';

export interface RadioProps extends Omit<RACRadioProps, 'className' | 'children'> {
  /** Eticheta (.v-check__text > .body). */
  children?: React.ReactNode;
  /** Textul de sub etichetă (.v-check__desc). */
  description?: React.ReactNode;
  isInvalid?: boolean;
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  className?: string;
}

/* Radio din bundle.js: .v-check.v-radio, cercul .v-check__box cu bordura de 5px când e ales. */
export function Radio({
  children,
  description,
  isInvalid,
  state,
  className,
  ...props
}: RadioProps) {
  return (
    <RACRadio
      {...props}
      className={cn(styles.root, isInvalid && styles.isError, forced(styles, state), className)}
    >
      <span className={styles.boxWrap}>
        <span className={styles.box} aria-hidden="true" />
      </span>
      {(children || description) && (
        <span className={styles.text}>
          {children && <span className="body">{children}</span>}
          {description && <span className={cn(styles.desc, 'body-small')}>{description}</span>}
        </span>
      )}
    </RACRadio>
  );
}

export interface RadioGroupProps extends Omit<RACRadioGroupProps, 'className' | 'children'> {
  children: React.ReactNode;
  /** Legenda grupului (.v-formfield__label caption). */
  label?: React.ReactNode;
  isInvalid?: boolean;
  /** Textul de ajutor de sub opțiuni. */
  hint?: React.ReactNode;
  /** Mesajul de eroare (implică isInvalid). */
  error?: React.ReactNode;
  /** Textul pentru cititorul de ecran după „*” (S.required). */
  requiredLabel?: string;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/* RadioGroup din bundle.js: fieldset.v-radiogroup > legend + .v-radiogroup__items + eroare/ajutor. */
export function RadioGroup({
  children,
  label,
  isInvalid,
  hint,
  error,
  requiredLabel,
  orientation = 'vertical',
  isRequired,
  isDisabled,
  className,
  ...props
}: RadioGroupProps) {
  const legendId = useId();
  const invalid = Boolean(isInvalid || error);
  return (
    <RACRadioGroup
      {...props}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isInvalid={invalid}
      orientation={orientation}
      aria-labelledby={label ? legendId : undefined}
      className={styles.contents}
    >
      <fieldset
        className={cn(styles.group, orientation === 'horizontal' && styles.horizontal, className)}
        disabled={isDisabled}
      >
        {label && (
          <legend id={legendId} className={cn(styles.legend, 'caption')}>
            {label}
            {isRequired && (
              <span className={styles.req} aria-hidden="true">
                {' *'}
              </span>
            )}
            {isRequired && requiredLabel && (
              <span className={styles.sr}>{` (${requiredLabel})`}</span>
            )}
          </legend>
        )}
        <div className={styles.items}>{children}</div>
        {error ? (
          <p className={cn(styles.error, 'caption')}>
            <Icon icon="circle-alert" size={14} className={styles.errorIcon} />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p className={cn(styles.hint, 'caption')}>{hint}</p>
        ) : null}
      </fieldset>
    </RACRadioGroup>
  );
}
