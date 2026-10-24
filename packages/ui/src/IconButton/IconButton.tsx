'use client';

import { Button as RACButton, Tooltip, TooltipTrigger } from 'react-aria-components';
import type { LucideIcon } from 'lucide-react';
import { Icon, type IconSize } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  size?: IconSize;
  variant?: IconButtonVariant;
  isDisabled?: boolean;
  onPress?: () => void;
  className?: string;
  'aria-controls'?: string;
  'aria-expanded'?: boolean;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'secondary',
  isDisabled,
  onPress,
  className,
  ...ariaProps
}: IconButtonProps) {
  return (
    <TooltipTrigger delay={600}>
      <RACButton
        aria-label={label}
        isDisabled={isDisabled}
        onPress={onPress}
        className={cn(styles.root, styles[size], styles[variant], className)}
        {...ariaProps}
      >
        <Icon icon={icon} size={size} aria-hidden />
      </RACButton>
      <Tooltip>
        <span className={styles.tooltip}>{label}</span>
      </Tooltip>
    </TooltipTrigger>
  );
}
