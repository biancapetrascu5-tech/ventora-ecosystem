'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { forced, type ForcedState } from '../lib/forced';
import { ThemedPortal, useAnchor, useOutside } from '../lib/popover';
import control from '../Input/Input.module.css';
import list from '../Select/Select.module.css';
import styles from './Combobox.module.css';

type Value = string | number;

export interface ComboboxOption {
  value: Value;
  label: string;
  description?: string;
  icon?: IconName;
  isDisabled?: boolean;
}

export interface ComboboxOptionGroup {
  label: string;
  options: ComboboxOption[];
}

export interface ComboboxLabels {
  /** S.remove — butonul de pe chip, urmat de numele opțiunii. */
  remove?: string;
  /** S.clearChoice — butonul „x” când e aleasă o valoare. */
  clearChoice?: string;
  /** S.loading — lista goală cât se încarcă. */
  loading?: string;
  /** S.noResults. */
  noResults?: string;
  /** S.noResultsFor, ex. (q) => `Niciun rezultat pentru „${q}”`. */
  noResultsFor?: (q: string) => string;
}

interface ComboboxBaseProps {
  options: (ComboboxOption | ComboboxOptionGroup)[];
  placeholder?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isLoading?: boolean;
  /** Deschis la montare (documentație, galerii). */
  defaultOpen?: boolean;
  defaultQuery?: string;
  onQueryChange?: (q: string) => void;
  /** false = lista nu se filtrează local (căutare pe server). */
  filter?: boolean;
  /** Iconița din stânga; implicit „search”. */
  icon?: IconName | null;
  size?: 'sm' | 'md' | 'lg';
  /** Stare vizuală forțată (galerii, documentație). */
  state?: ForcedState;
  labels?: ComboboxLabels;
  /** Textul când nu există rezultate (înlocuiește labels.noResults/noResultsFor). */
  emptyText?: string;
  /** @deprecated folosește `emptyText`. */
  noResultsLabel?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  className?: string;
}

export interface ComboboxSingleProps extends ComboboxBaseProps {
  multiple?: false;
  value?: Value | null;
  defaultValue?: Value | null;
  onChange?: (value: Value | null) => void;
}

export interface ComboboxMultiProps extends ComboboxBaseProps {
  multiple: true;
  value?: Value[];
  defaultValue?: Value[];
  onChange?: (value: Value[]) => void;
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultiProps;

type FlatOption = ComboboxOption & { group?: string };

function flatten(options: (ComboboxOption | ComboboxOptionGroup)[]): FlatOption[] {
  const out: FlatOption[] = [];
  for (const o of options) {
    if ('options' in o) for (const c of o.options) out.push({ ...c, group: o.label });
    else out.push(o);
  }
  return out;
}

/* Combobox din bundle.js: .v-control.v-combobox cu câmp de căutare, chips (multiple) și listă .v-popover.v-listbox. */
export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder,
    isDisabled,
    isInvalid,
    isLoading,
    defaultOpen = false,
    defaultQuery = '',
    onQueryChange,
    filter = true,
    icon = 'search',
    size = 'md',
    state,
    labels,
    emptyText,
    noResultsLabel,
    id,
    'aria-describedby': describedBy,
    'aria-required': required,
    className,
  } = props;
  const multiple = props.multiple === true;
  const [inner, setInner] = useState<Value | Value[] | null>(
    props.defaultValue !== undefined ? props.defaultValue : multiple ? [] : null,
  );
  const v = props.value !== undefined ? props.value : inner;
  const set = (next: Value | Value[] | null) => {
    if (props.value === undefined) setInner(next);
    (props.onChange as ((x: Value | Value[] | null) => void) | undefined)?.(next);
  };
  const [q, setQ] = useState(defaultQuery);
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = 'l' + useId().replace(/:/g, '');
  const { popRef, style } = useAnchor(wrap, open, { matchWidth: true });
  useOutside([wrap, popRef], () => setOpen(false), open);

  const all = useMemo(() => flatten(options), [options]);
  const items = useMemo(() => {
    if (!filter || !q) return all;
    const n = q.toLocaleLowerCase();
    return all.filter(
      (o) =>
        String(o.label).toLocaleLowerCase().includes(n) ||
        (o.description && String(o.description).toLocaleLowerCase().includes(n)),
    );
  }, [all, q, filter]);
  const selected: Value[] = multiple ? ((v as Value[] | null) ?? []) : [];
  const isSel = (o: FlatOption) => (multiple ? selected.includes(o.value) : v === o.value);
  const current = multiple ? null : (all.find((o) => o.value === v) ?? null);

  useEffect(() => setActive(0), [q]);

  const pick = (o: FlatOption) => {
    if (o.isDisabled) return;
    if (multiple) {
      set(isSel(o) ? selected.filter((x) => x !== o.value) : [...selected, o.value]);
      setQ('');
    } else {
      set(o.value);
      setQ('');
      setOpen(false);
    }
    input.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) setActive((a) => Math.min(items.length - 1, a + 1));
      else setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (open && items[active]) {
        e.preventDefault();
        pick(items[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (q) setQ('');
    } else if (e.key === 'Backspace' && multiple && !q && selected.length) {
      set(selected.slice(0, -1));
    }
  };

  const empty = isLoading
    ? labels?.loading
    : (emptyText ??
      noResultsLabel ??
      (q && labels?.noResultsFor ? labels.noResultsFor(q) : labels?.noResults));

  let lastGroup: string | undefined;

  return (
    <>
      <div
        ref={wrap}
        className={cn(
          control.control,
          control[size],
          styles.combobox,
          multiple && styles.multi,
          current && styles.hasValue,
          isInvalid && control.isError,
          isDisabled && control.isDisabled,
          open && styles.isOpen,
          forced(control, state),
          className,
        )}
        onClick={() => input.current?.focus()}
      >
        {icon && <Icon icon={icon} size={16} className={control.icon} />}
        {multiple &&
          selected.map((val) => {
            const o = all.find((x) => x.value === val);
            return (
              <span key={String(val)} className={cn(styles.chip, 'caption')}>
                {o ? o.label : String(val)}
                <button
                  type="button"
                  className={styles.chipX}
                  aria-label={`${labels?.remove ?? ''} ${o ? o.label : ''}`.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    set(selected.filter((x) => x !== val));
                  }}
                  disabled={isDisabled}
                >
                  <Icon icon="x" size={12} />
                </button>
              </span>
            );
          })}
        <input
          ref={input}
          id={id}
          className={cn(control.input, 'body')}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          placeholder={multiple && selected.length ? '' : current ? current.label : placeholder}
          value={q}
          disabled={isDisabled}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            onQueryChange?.(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {isLoading && (
          <span className={control.spinner} style={{ width: 16, height: 16 }}>
            <Icon icon="loader-circle" size={16} />
          </span>
        )}
        {!isLoading && !multiple && current && !isDisabled && (
          <button
            type="button"
            className={control.btn}
            aria-label={labels?.clearChoice}
            onClick={(e) => {
              e.stopPropagation();
              set(null);
              setQ('');
            }}
          >
            <Icon icon="x" size={14} />
          </button>
        )}
      </div>
      {open && !isDisabled && (
        <ThemedPortal>
          <div
            ref={popRef}
            className={cn(list.popover, list.listbox, styles.pop)}
            style={style}
            role="listbox"
            id={listId}
            aria-multiselectable={multiple || undefined}
          >
            {items.length === 0 && <div className={cn(list.empty, 'body-small')}>{empty}</div>}
            {items.map((o, i) => {
              const head =
                o.group && o.group !== lastGroup ? (
                  <div className={cn(list.group, 'caption')}>{o.group}</div>
                ) : null;
              lastGroup = o.group;
              const sel = isSel(o);
              return (
                <div key={String(o.value)} style={{ display: 'contents' }}>
                  {head}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={sel}
                    aria-disabled={o.isDisabled || undefined}
                    className={cn(
                      list.option,
                      i === active && list.optionActive,
                      sel && list.optionSelected,
                      o.isDisabled && list.optionDisabled,
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o)}
                    onMouseEnter={() => setActive(i)}
                  >
                    {multiple && (
                      <span className={cn(styles.check, sel && styles.checkOn)} aria-hidden="true">
                        <Icon icon="check" size={12} strokeWidth={3} />
                      </span>
                    )}
                    {o.icon && <Icon icon={o.icon} size={16} className={list.optionIcon} />}
                    <span className={list.optionText}>
                      <span className="body">{o.label}</span>
                      {o.description && (
                        <span className={cn(list.optionDesc, 'body-small')}>{o.description}</span>
                      )}
                    </span>
                    {!multiple && sel && (
                      <Icon icon="check" size={16} className={list.optionTick} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ThemedPortal>
      )}
    </>
  );
}
