'use client';

import { RadioGroup, Radio, type RadioGroupProps } from 'react-aria-components';
import { cn } from '../lib/cn';
import styles from './SegmentedControl.module.css';

export interface SegmentedControlOption {
  value: string;
  label: string;
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
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  fullWidth,
  className,
  ...props
}: SegmentedControlProps) {
  return (
    <RadioGroup
      value={value}
      defaultValue={defaultValue ?? options[0]?.value}
      onChange={onChange}
      orientation="horizontal"
      className={cn(styles.root, fullWidth && styles.full, className)}
      {...props}
    >
      {options.map((opt) => (
        <Radio
          key={opt.value}
          value={opt.value}
          isDisabled={opt.isDisabled}
          className={styles.item}
        >
          {opt.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}
