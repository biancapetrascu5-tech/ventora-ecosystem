'use client';

import {
  Checkbox as RACCheckbox,
  type CheckboxProps as RACCheckboxProps,
} from 'react-aria-components';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<RACCheckboxProps, 'className' | 'children'> {
  /** Eticheta (.v-check__text > .body). */
  children?: React.ReactNode;
  /** Textul de sub etichetă (.v-check__desc). */
  description?: React.ReactNode;
  isInvalid?: boolean;
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  className?: string;
}

/* Checkbox din bundle.js: .v-check > .v-check__box-wrap (20px; 44px pe mobil) > .v-check__box (16px). */
export function Checkbox({
  children,
  description,
  isInvalid,
  state,
  className,
  ...props
}: CheckboxProps) {
  return (
    <RACCheckbox
      {...props}
      isInvalid={isInvalid}
      className={() =>
        cn(styles.root, isInvalid && styles.isError, forced(styles, state), className)
      }
    >
      {({ isIndeterminate }) => (
        <>
          <span className={styles.boxWrap}>
            <span className={styles.box} aria-hidden="true">
              <Icon icon={isIndeterminate ? 'minus' : 'check'} size={12} strokeWidth={3} />
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
    </RACCheckbox>
  );
}
