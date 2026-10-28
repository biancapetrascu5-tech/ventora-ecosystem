'use client';

import {
  Checkbox as RACCheckbox,
  type CheckboxProps as RACCheckboxProps,
} from 'react-aria-components';
import { Check, Minus } from 'lucide-react';
import { cn } from '../lib/cn';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<RACCheckboxProps, 'className' | 'children'> {
  children?: React.ReactNode;
  isInvalid?: boolean;
  className?: string;
}

export function Checkbox({ children, isInvalid, className, ...props }: CheckboxProps) {
  return (
    <RACCheckbox
      {...props}
      className={() => cn(styles.root, isInvalid && styles.invalid, className)}
    >
      {({ isIndeterminate }) => (
        <>
          {/* .v-check__box-wrap (20px; 44px pe mobil) > .v-check__box (16px) */}
          <span className={styles.boxWrap}>
            <span className={styles.box}>
              {isIndeterminate ? (
                <Minus size={12} strokeWidth={3} className={styles.indeterminateIcon} aria-hidden />
              ) : (
                <Check size={12} strokeWidth={3} className={styles.checkIcon} aria-hidden />
              )}
            </span>
          </span>
          {children && <span className={styles.label}>{children}</span>}
        </>
      )}
    </RACCheckbox>
  );
}
