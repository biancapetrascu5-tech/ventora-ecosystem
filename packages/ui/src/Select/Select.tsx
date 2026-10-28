'use client';

import { useRef, useState } from 'react';
import {
  Select as RACSelect,
  SelectValue,
  Button as RACButton,
  Popover,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Header,
  type Key,
} from 'react-aria-components';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: IconName;
  isDisabled?: boolean;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps {
  options: (SelectOption | SelectOptionGroup)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Spinner în locul chevronului; lista nu se deschide. */
  isLoading?: boolean;
  /** Iconița de 16px din stânga valorii (sau iconița opțiunii alese). */
  icon?: IconName;
  name?: string;
  id?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
}

const isGroup = (o: SelectOption | SelectOptionGroup): o is SelectOptionGroup => 'options' in o;

function OptionItem({ o }: { o: SelectOption }) {
  return (
    <ListBoxItem
      id={o.value}
      textValue={o.label}
      isDisabled={o.isDisabled}
      className={styles.option}
    >
      {({ isSelected }) => (
        <>
          {o.icon && <Icon icon={o.icon} size={16} className={styles.optionIcon} />}
          <span className={styles.optionText}>
            <span className="body">{o.label}</span>
            {o.description && (
              <span className={cn(styles.optionDesc, 'body-small')}>{o.description}</span>
            )}
          </span>
          {isSelected && <Icon icon="check" size={16} className={styles.optionTick} />}
        </>
      )}
    </ListBoxItem>
  );
}

/* Select din bundle.js: trigger .v-control.v-select, listă .v-popover.v-listbox cu .v-option. */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  placeholder,
  isDisabled,
  isInvalid,
  isLoading,
  icon,
  name,
  id,
  size = 'md',
  state,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  className,
}: SelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [portalTheme, setPortalTheme] = useState<string | undefined>(undefined);
  const [inner, setInner] = useState(defaultValue);
  const selectedKey = value !== undefined ? value : inner;
  const current =
    options.flatMap((o) => (isGroup(o) ? o.options : [o])).find((o) => o.value === selectedKey) ??
    null;

  const handleChange = (key: Key | null) => {
    if (key === null) return;
    if (value === undefined) setInner(String(key));
    onChange?.(String(key));
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
        isOpen={isLoading ? false : undefined}
        isDisabled={isDisabled}
        name={name}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(styles.root, className)}
      >
        <RACButton
          aria-busy={isLoading || undefined}
          className={cn(
            styles.trigger,
            styles[size],
            isInvalid && styles.isError,
            isDisabled && styles.isDisabled,
            forced(styles, state),
          )}
        >
          <SelectValue className={styles.valueWrap}>
            {() => {
              const ic = current?.icon ?? icon;
              return (
                <>
                  {ic && <Icon icon={ic} size={16} className={styles.triggerLead} />}
                  <span
                    className={cn(styles.triggerValue, 'body', !current && styles.isPlaceholder)}
                  >
                    {current ? current.label : placeholder}
                  </span>
                </>
              );
            }}
          </SelectValue>
          {isLoading ? (
            <span className={styles.spinner} style={{ width: 16, height: 16 }}>
              <Icon icon="loader-circle" size={16} />
            </span>
          ) : (
            <Icon icon="chevron-down" size={16} aria-hidden className={styles.triggerIcon} />
          )}
        </RACButton>
        <Popover
          className={cn(styles.popover, 'v-portal-theme')}
          {...(portalTheme !== undefined ? { 'data-theme': portalTheme } : {})}
        >
          <ListBox className={styles.listbox}>
            {options.map((o) =>
              isGroup(o) ? (
                <ListBoxSection key={`g-${o.label}`} id={`g-${o.label}`}>
                  <Header className={cn(styles.group, 'caption')}>{o.label}</Header>
                  {o.options.map((x) => (
                    <OptionItem key={x.value} o={x} />
                  ))}
                </ListBoxSection>
              ) : (
                <OptionItem key={o.value} o={o} />
              ),
            )}
          </ListBox>
        </Popover>
      </RACSelect>
    </div>
  );
}
