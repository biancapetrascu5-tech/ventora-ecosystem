'use client';

import {
  Radio as RACRadio,
  RadioGroup as RACRadioGroup,
  type RadioProps as RACRadioProps,
  type RadioGroupProps as RACRadioGroupProps,
} from 'react-aria-components';
import { cn } from '../lib/cn';
import styles from './Radio.module.css';

export interface RadioProps extends Omit<RACRadioProps, 'className' | 'children'> {
  children?: React.ReactNode;
  className?: string;
}

export function Radio({ children, className, ...props }: RadioProps) {
  return (
    <RACRadio
      {...props}
      className={cn(styles.root, className)}
    >
      <div className={styles.dot}>
        <div className={styles.inner} aria-hidden />
      </div>
      {children && <span className={styles.label}>{children}</span>}
    </RACRadio>
  );
}

export interface RadioGroupProps extends Omit<RACRadioGroupProps, 'className' | 'children'> {
  children: React.ReactNode;
  label?: string;
  isInvalid?: boolean;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export function RadioGroup({
  children,
  label,
  isInvalid,
  orientation = 'vertical',
  className,
  ...props
}: RadioGroupProps) {
  return (
    <RACRadioGroup
      {...props}
      isInvalid={isInvalid}
      orientation={orientation}
      className={cn(
        styles.group,
        orientation === 'horizontal' && styles.groupHorizontal,
        isInvalid && styles.invalid,
        className
      )}
    >
      {label && <span className={styles.groupLabel}>{label}</span>}
      {children}
    </RACRadioGroup>
  );
}
