'use client';

import { Switch as RACSwitch, type SwitchProps as RACSwitchProps } from 'react-aria-components';
import { cn } from '../lib/cn';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<RACSwitchProps, 'className' | 'children'> {
  children?: React.ReactNode;
  isInvalid?: boolean;
  className?: string;
}

export function Toggle({ children, isInvalid, className, ...props }: ToggleProps) {
  return (
    <RACSwitch {...props} className={cn(styles.root, isInvalid && styles.invalid, className)}>
      <div className={styles.track}>
        <div className={styles.thumb} aria-hidden />
      </div>
      {children && <span className={styles.label}>{children}</span>}
    </RACSwitch>
  );
}
