'use client';

import { Button as RACButton, type ButtonProps as RACButtonProps } from 'react-aria-components';
import { cva, type VariantProps } from 'class-variance-authority';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Button.module.css';

const buttonVariants = cva(styles.root, {
  variants: {
    variant: {
      primary: styles.primary,
      secondary: styles.secondary,
      outline: styles.outline,
      quiet: styles.quiet,
      danger: styles.danger,
      'danger-quiet': styles.dangerQuiet,
    },
    size: {
      sm: styles.sm,
      md: styles.md,
      lg: styles.lg,
    },
    block: { true: styles.block },
  },
  defaultVariants: { variant: 'secondary', size: 'md' },
});

export interface ButtonProps
  extends
    Omit<RACButtonProps, 'className' | 'style' | 'children'>,
    VariantProps<typeof buttonVariants> {
  /** 16px icon before the label. */
  icon?: IconName;
  /** 16px icon after the label. */
  iconEnd?: IconName;
  className?: string;
  children?: React.ReactNode;
}

export function Button({
  variant,
  size,
  block,
  icon,
  iconEnd,
  className,
  children,
  isPending,
  ...props
}: ButtonProps) {
  return (
    <RACButton
      {...props}
      isPending={isPending}
      className={cn(buttonVariants({ variant, size, block }), className)}
    >
      {isPending ? (
        <span className={styles.spinner} style={{ width: 16, height: 16 }}>
          <Icon icon="loader-circle" size={16} />
        </span>
      ) : icon ? (
        <Icon icon={icon} size={16} />
      ) : null}
      {children != null && <span className={cn(styles.label, 'body-strong')}>{children}</span>}
      {iconEnd && !isPending && <Icon icon={iconEnd} size={16} />}
    </RACButton>
  );
}
