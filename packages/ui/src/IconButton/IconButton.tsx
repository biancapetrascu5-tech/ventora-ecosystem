'use client';

import { Button as RACButton, Tooltip, TooltipTrigger } from 'react-aria-components';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface IconButtonProps {
  icon: IconName;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  /** Mărimea iconiței, când diferă de cea a butonului (ex. 16 într-un buton lg, ca în DataTable). */
  iconSize?: number;
  variant?: IconButtonVariant;
  isDisabled?: boolean;
  /** Spinner în locul iconiței; butonul rămâne activ vizual, apăsarea e ignorată. */
  isPending?: boolean;
  /** Buton comutat (aria-pressed). */
  pressed?: boolean;
  /** Număr de necitite sau `true` pentru punct. */
  badge?: number | boolean;
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  onPress?: () => void;
  className?: string;
  'aria-controls'?: string;
  'aria-expanded'?: boolean;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  iconSize,
  variant = 'quiet',
  isDisabled,
  isPending,
  pressed,
  badge,
  state,
  onPress,
  className,
  ...ariaProps
}: IconButtonProps) {
  return (
    <TooltipTrigger delay={600}>
      <RACButton
        aria-label={label}
        aria-pressed={pressed}
        isDisabled={isDisabled}
        isPending={isPending}
        onPress={onPress}
        className={cn(
          styles.root,
          styles[size],
          styles[variant],
          pressed && styles.isOn,
          forced(styles, state),
          className,
        )}
        {...ariaProps}
      >
        {isPending ? (
          <span className={styles.spinner} style={{ width: size === 'sm' ? 14 : 16 }}>
            <Icon icon="loader-circle" size={size === 'sm' ? 14 : 16} />
          </span>
        ) : (
          <Icon icon={icon} size={iconSize ?? (size === 'lg' ? 20 : 16)} />
        )}
        {badge != null && badge !== false && (
          <span className={cn(styles.badge, 'caption')} aria-hidden="true">
            {badge === true ? '' : badge}
          </span>
        )}
      </RACButton>
      <Tooltip>
        <span className={styles.tooltip}>{label}</span>
      </Tooltip>
    </TooltipTrigger>
  );
}
