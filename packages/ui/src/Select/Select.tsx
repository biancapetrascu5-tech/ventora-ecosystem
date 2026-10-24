'use client';

import {
  Select as RACSelect,
  SelectValue,
  Button as RACButton,
  Popover,
  ListBox,
  ListBoxItem,
  type Key,
} from 'react-aria-components';
import { ChevronDown, Check } from 'lucide-react';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  isDisabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  name?: string;
  id?: string;
  className?: string;
}

export function Select({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  isDisabled,
  isInvalid,
  name,
  id,
  className,
}: SelectProps) {
  const handleChange = (key: Key | null) => {
    if (key !== null) onChange?.(String(key));
  };

  return (
    <RACSelect
      selectedKey={value}
      defaultSelectedKey={defaultValue}
      onSelectionChange={handleChange}
      isDisabled={isDisabled}
      name={name}
      id={id}
      aria-invalid={isInvalid || undefined}
      className={cn(styles.root, isInvalid && styles.invalid, className)}
    >
      <RACButton className={styles.trigger}>
        <SelectValue className={styles.triggerValue}>
          {({ selectedItem }) =>
            selectedItem ? (selectedItem as SelectOption).label : (
              <span data-placeholder>{placeholder}</span>
            )
          }
        </SelectValue>
        <Icon icon={ChevronDown} size="sm" aria-hidden className={styles.triggerIcon} />
      </RACButton>
      <Popover className={styles.popover}>
        <ListBox
          items={options}
          className={styles.listbox}
        >
          {(item) => (
            <ListBoxItem
              key={item.value}
              id={item.value}
              textValue={item.label}
              isDisabled={item.isDisabled}
              className={styles.item}
            >
              {({ isSelected }) => (
                <>
                  <span className={styles.itemCheck}>
                    {isSelected && <Icon icon={Check} size="sm" aria-hidden />}
                  </span>
                  {item.label}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </RACSelect>
  );
}
