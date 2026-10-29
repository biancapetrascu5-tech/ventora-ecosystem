'use client';

import { Switch as RACSwitch, type SwitchProps as RACSwitchProps } from 'react-aria-components';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<RACSwitchProps, 'className' | 'children'> {
  /** Eticheta (.v-check__text > .body). */
  children?: React.ReactNode;
  /** Textul de sub etichetă. */
  description?: React.ReactNode;
  isInvalid?: boolean;
  /** Spinner în buton; apăsarea e ignorată. */
  isLoading?: boolean;
  /** `start` = eticheta în stânga, comutatorul la capătul rândului. */
  labelPosition?: 'start' | 'end';
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  className?: string;
}

/* Toggle din bundle.js: .v-toggle > .v-toggle__track (40×24) > .v-toggle__thumb (16px, bifă 10px când e pornit). */
export function Toggle({
  children,
  description,
  isInvalid,
  isLoading,
  labelPosition = 'end',
  state,
  className,
  onChange,
  ...props
}: ToggleProps) {
  return (
    <RACSwitch
      {...props}
      onChange={(v) => {
        if (!isLoading) onChange?.(v);
      }}
      aria-busy={isLoading || undefined}
      className={cn(
        styles.root,
        labelPosition === 'start' && styles.labelStart,
        isInvalid && styles.isError,
        isLoading && styles.isLoading,
        forced(styles, state),
        className,
      )}
    >
      {({ isSelected }) => (
        <>
          <span className={styles.track}>
            <span className={styles.thumb}>
              {isLoading ? (
                <span className={styles.spinner} style={{ width: 12, height: 12 }}>
                  <Icon icon="loader-circle" size={12} />
                </span>
              ) : isSelected ? (
                <Icon icon="check" size={10} strokeWidth={3} />
              ) : null}
            </span>
          </span>
          {(children || description) && (
            <span className={styles.text}>
              {children && <span className="body">{children}</span>}
              {description && <span className={cn(styles.desc, 'body-small')}>{description}</span>}
            </span>
          )}
        </>
      )}
    </RACSwitch>
  );
}
