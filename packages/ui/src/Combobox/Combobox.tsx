'use client';

import {
  ComboBox as RACComboBox,
  Input,
  Button as RACButton,
  Popover,
  ListBox,
  ListBoxItem,
  type Key,
} from 'react-aria-components';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Combobox.module.css';

export interface ComboboxOption {
  value: string;
  label: string;
  isDisabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  noResultsLabel?: string;
  name?: string;
  id?: string;
  className?: string;
}

export function Combobox({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  isDisabled,
  isInvalid,
  noResultsLabel = 'Niciun rezultat',
  name,
  id,
  className,
}: ComboboxProps) {
  const handleChange = (key: Key | null) => {
    if (key !== null) onChange?.(String(key));
  };

  return (
    <RACComboBox
      selectedKey={value}
      defaultSelectedKey={defaultValue}
      onSelectionChange={handleChange}
      isDisabled={isDisabled}
      name={name}
      id={id}
      aria-invalid={isInvalid || undefined}
      className={cn(styles.root, isInvalid && styles.invalid, className)}
    >
      <div className={styles.inputWrapper}>
        <Input
          placeholder={placeholder}
          className={styles.input}
        />
        <RACButton className={styles.toggleButton}>
          <Icon icon="chevron-down" size="sm" aria-hidden />
        </RACButton>
      </div>
      <Popover className={styles.popover}>
        <ListBox
          items={options}
          className={styles.listbox}
          renderEmptyState={() => (
            <div className={styles.noResults}>{noResultsLabel}</div>
          )}
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
                    {isSelected && <Icon icon="check" size="sm" aria-hidden />}
                  </span>
                  {item.label}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </RACComboBox>
  );
}
