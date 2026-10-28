'use client';

import { useRef, useState } from 'react';
import {
  Select as RACSelect,
  SelectValue,
  Button as RACButton,
  Popover,
  ListBox,
  ListBoxItem,
  type Key,
} from 'react-aria-components';
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
  size?: 'sm' | 'md' | 'lg';
  'aria-label'?: string;
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
  size = 'md',
  'aria-label': ariaLabel,
  className,
}: SelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [portalTheme, setPortalTheme] = useState<string | undefined>(undefined);

  const handleChange = (key: Key | null) => {
    if (key !== null) onChange?.(String(key));
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && rootRef.current) {
      const ancestor = rootRef.current.closest('[data-theme]');
      setPortalTheme(ancestor?.getAttribute('data-theme') ?? undefined);
    }
  };

  return (
    <div ref={rootRef} style={{ display: 'contents' }}>
      <RACSelect
        selectedKey={value}
        defaultSelectedKey={defaultValue}
        onSelectionChange={handleChange}
        onOpenChange={handleOpenChange}
        isDisabled={isDisabled}
        name={name}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={isInvalid || undefined}
        className={cn(styles.root, isInvalid && styles.invalid, className)}
      >
        <RACButton className={cn(styles.trigger, styles[size])}>
          <SelectValue className={cn(styles.triggerValue, 'body')}>
            {({ selectedItem }) =>
              selectedItem ? (
                (selectedItem as SelectOption).label
              ) : (
                <span data-placeholder>{placeholder}</span>
              )
            }
          </SelectValue>
          <Icon icon="chevron-down" size="sm" aria-hidden className={styles.triggerIcon} />
        </RACButton>
        <Popover
          className={cn(styles.popover, 'v-portal-theme')}
          {...(portalTheme !== undefined ? { 'data-theme': portalTheme } : {})}
        >
          <ListBox items={options} className={styles.listbox}>
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
      </RACSelect>
    </div>
  );
}
