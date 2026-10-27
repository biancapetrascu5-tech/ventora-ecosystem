'use client';

import { Button as RACButton, type ButtonProps as RACButtonProps } from 'react-aria-components';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
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
    },
    size: {
      sm: styles.sm,
      md: styles.md,
      lg: styles.lg,
    },
  },
  defaultVariants: { variant: 'secondary', size: 'md' },
});

export interface ButtonProps
  extends
    Omit<RACButtonProps, 'className' | 'style' | 'children'>,
    VariantProps<typeof buttonVariants> {
  className?: string;
  children?: React.ReactNode;
}

export function Button({ variant, size, className, children, isPending, ...props }: ButtonProps) {
  return (
    <RACButton
      {...props}
      isPending={isPending}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {isPending && (
        <Loader2
          size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
          strokeWidth={2}
          aria-hidden
          className={styles.spinner}
        />
      )}
      {children}
    </RACButton>
  );
}
