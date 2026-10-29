'use client';

import { RadioGroup, Radio, type RadioGroupProps } from 'react-aria-components';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './SegmentedControl.module.css';

export interface SegmentedControlOption {
  value: string;
  label: string;
  icon?: IconName;
  isDisabled?: boolean;
}

export interface SegmentedControlProps extends Omit<
  RadioGroupProps,
  'children' | 'className' | 'orientation'
> {
  options: SegmentedControlOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  /** Pe toată lățimea (.v-seg--block). */
  block?: boolean;
  /** @deprecated folosește `block`. */
  fullWidth?: boolean;
  /** Doar iconițe; eticheta devine aria-label și title. */
  iconOnly?: boolean;
  className?: string;
}

/* SegmentedControl din bundle.js: .v-seg (pistă sunken) > .v-seg__item, cel ales pe sheet cu shadow-1. */
export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  size = 'md',
  block,
  fullWidth,
  iconOnly,
  isDisabled,
  className,
  ...props
}: SegmentedControlProps) {
  return (
    <RadioGroup
      value={value}
      defaultValue={defaultValue ?? options[0]?.value}
      onChange={onChange}
      orientation="horizontal"
      isDisabled={isDisabled}
      className={cn(styles.root, styles[size], (block || fullWidth) && styles.block, className)}
      {...props}
    >
      {options.map((opt) => (
        <Radio
          key={opt.value}
          value={opt.value}
          isDisabled={opt.isDisabled}
          aria-label={iconOnly ? opt.label : undefined}
          className={styles.item}
        >
          <span className={styles.inner} title={iconOnly ? opt.label : undefined}>
            {opt.icon && <Icon icon={opt.icon} size={16} />}
            {!iconOnly && <span className="body-strong">{opt.label}</span>}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
