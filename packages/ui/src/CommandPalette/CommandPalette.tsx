'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog as RACDialog, Modal, ModalOverlay } from 'react-aria-components';
import { Icon, type IconName } from '../Icon/Icon';
import { Kbd } from '../Kbd/Kbd';
import { cn } from '../lib/cn';
import styles from './CommandPalette.module.css';

export interface CommandDef {
  id: string;
  label: string;
  icon?: IconName;
  description?: string;
  /** Tastele scurtăturii (Kbd). */
  shortcut?: string[];
  /** Cuvinte în plus pentru căutare. */
  keywords?: string;
  /** Grupul (doar pentru `commands`). */
  group?: string;
  onSelect: () => void;
}

export interface CommandGroup {
  label: string;
  items: CommandDef[];
}

export interface CommandPaletteLabels {
  /** S.commandPlaceholder — câmpul de căutare. */
  placeholder?: string;
  /** S.loading, S.noResults, S.noResultsFor. */
  loading?: string;
  noResults?: string;
  noResultsFor?: (q: string) => string;
  /** Subsolul: S.navigate, S.choose, S.dismiss. */
  navigate?: string;
  choose?: string;
  dismiss?: string;
}

export interface CommandPaletteProps {
  /** Grupurile de comenzi (Pagini, Persoane, Comenzi…). */
  groups?: CommandGroup[];
  /** Listă plată, grupată după `group` (compatibilitate). */
  commands?: CommandDef[];
  placeholder?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onQueryChange?: (q: string) => void;
  /** Rezultatele vin de pe server. */
  isLoading?: boolean;
  /** Panoul fără fereastră modală (documentație). */
  inline?: boolean;
  /** Deschide/închide cu Cmd/Ctrl+K (doar varianta modală). */
  hotkey?: boolean;
  labels?: CommandPaletteLabels;
}

function groupCommands(commands: CommandDef[]): CommandGroup[] {
  const map = new Map<string, CommandDef[]>();
  for (const c of commands) {
    const k = c.group ?? '';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(c);
  }
  return [...map].map(([label, items]) => ({ label, items }));
}

function Panel({
  groups,
  placeholder,
  onQueryChange,
  isLoading,
  inline,
  labels,
  onRun,
}: {
  groups: CommandGroup[];
  placeholder?: string;
  onQueryChange?: (q: string) => void;
  isLoading?: boolean;
  inline?: boolean;
  labels?: CommandPaletteLabels;
  onRun: (c: CommandDef) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const base = 'k' + useId().replace(/:/g, '');
  const ph = placeholder ?? labels?.placeholder;

  const filtered = useMemo(() => {
    const n = q.trim().toLocaleLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: n
          ? g.items.filter((it) =>
              `${it.label} ${it.keywords ?? ''} ${it.description ?? ''}`
                .toLocaleLowerCase()
                .includes(n),
            )
          : g.items,
      }))
      .filter((g) => g.items.length);
  }, [groups, q]);
  const flat = filtered.flatMap((g) => g.items);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`#${base}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, base]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = flat[active];
      if (it) onRun(it);
    }
  };

  let idx = -1;
  return (
    <div className={cn(styles.cmdk, inline && styles.inline)} aria-label={ph}>
      <div className={styles.search}>
        <Icon icon="search" size={20} />
        <input
          className={cn(styles.input, 'body')}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${base}-list`}
          aria-activedescendant={flat[active] ? `${base}-${active}` : undefined}
          placeholder={ph}
          value={q}
          autoFocus={!inline}
          onChange={(e) => {
            setQ(e.target.value);
            onQueryChange?.(e.target.value);
          }}
          onKeyDown={onKey}
        />
        <Kbd keys={['Esc']} />
      </div>
      <div className={styles.list} role="listbox" id={`${base}-list`} ref={listRef}>
        {isLoading && <div className={cn(styles.empty, 'body-small')}>{labels?.loading}</div>}
        {!isLoading && flat.length === 0 && (
          <div className={cn(styles.empty, 'body-small')}>
            {q && labels?.noResultsFor ? labels.noResultsFor(q) : labels?.noResults}
          </div>
        )}
        {filtered.map((g) => (
          <div key={g.label} role="group" aria-label={g.label} className={styles.group}>
            {g.label && <div className={cn(styles.heading, 'caption')}>{g.label}</div>}
            {g.items.map((it) => {
              idx++;
              const i = idx;
              return (
                <div
                  key={it.id}
                  id={`${base}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={cn(styles.item, i === active && styles.isActive)}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onRun(it)}
                >
                  {it.icon && <Icon icon={it.icon} size={16} className={styles.icon} />}
                  <span className={styles.text}>
                    <span className="body">{it.label}</span>
                    {it.description && (
                      <span className={cn(styles.desc, 'body-small')}>{it.description}</span>
                    )}
                  </span>
                  {it.shortcut && <Kbd keys={it.shortcut} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className={cn(styles.foot, 'caption')}>
        <span>
          <Kbd keys={['up', 'down']} /> {labels?.navigate}
        </span>
        <span>
          <Kbd keys={['enter']} /> {labels?.choose}
        </span>
        <span>
          <Kbd keys={['Esc']} /> {labels?.dismiss}
        </span>
      </div>
    </div>
  );
}

/* CommandPalette din bundle.js: căutare de 48px, grupuri cu titlu, rândul activ pe selected,
   subsol sunken cu tastele; pe telefon ocupă tot ecranul. */
export function CommandPalette({
  groups,
  commands,
  placeholder,
  isOpen: isOpenProp,
  onOpenChange,
  onQueryChange,
  isLoading,
  inline,
  hotkey = true,
  labels,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (isOpenProp === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const all = useMemo(() => groups ?? groupCommands(commands ?? []), [groups, commands]);

  useEffect(() => {
    if (inline || !hotkey) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // setOpen depinde doar de isOpen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, inline, hotkey]);

  const run = (c: CommandDef) => {
    c.onSelect();
    setOpen(false);
  };
  const panel = (
    <Panel
      groups={all}
      placeholder={placeholder}
      onQueryChange={onQueryChange}
      isLoading={isLoading}
      inline={inline}
      labels={labels}
      onRun={run}
    />
  );

  if (inline) return isOpen === false ? null : <div role="dialog">{panel}</div>;

  return (
    <ModalOverlay className={styles.overlay} isOpen={isOpen} onOpenChange={setOpen} isDismissable>
      <Modal className={styles.modal}>
        <RACDialog className={styles.dialog} aria-label={placeholder ?? labels?.placeholder}>
          {panel}
        </RACDialog>
      </Modal>
    </ModalOverlay>
  );
}
