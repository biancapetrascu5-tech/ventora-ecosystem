'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { initials } from '../Avatar/Avatar';
import { Icon } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { ThemedPortal, useAnchor, useOutside } from '../lib/popover';
import list from '../Select/Select.module.css';
import styles from './OrgSwitcher.module.css';

export interface Org {
  id: string | number;
  name: string;
  /** Rolul tău în afacere (ex. „Proprietar”). */
  role?: string;
}

export interface OrgSwitcherLabels {
  /** S.switchBusiness — butonul, urmat de numele afacerii curente. */
  switchBusiness: string;
  /** S.yourBusinesses — titlul listei. */
  yourBusinesses: string;
  /** S.findBusiness — căutarea (peste 6 afaceri). */
  findBusiness: string;
  /** S.noResultsFor, ex. (q) => `Niciun rezultat pentru „${q}”`. */
  noResultsFor: (q: string) => string;
}

export interface OrgSwitcherProps {
  orgs: Org[];
  currentId?: Org['id'];
  onChange?: (id: Org['id']) => void;
  /** Doar inițialele, fără nume și rol. */
  compact?: boolean;
  defaultOpen?: boolean;
  labels: OrgSwitcherLabels;
  className?: string;
}

/* OrgSwitcher din bundle.js: marca cu inițiale + numele și rolul; cu o singură afacere e static. */
export function OrgSwitcher({
  orgs,
  currentId,
  onChange,
  compact,
  defaultOpen = false,
  labels,
  className,
}: OrgSwitcherProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [q, setQ] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const listId = 'o' + useId().replace(/:/g, '');
  const { popRef, style } = useAnchor(btn, open, { placement: 'bottom-start' });
  useOutside([btn, popRef], () => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

  const cur = orgs.find((o) => o.id === currentId) ?? orgs[0] ?? { id: '', name: '' };
  const shown = q
    ? orgs.filter((o) => o.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
    : orgs;
  const single = orgs.length <= 1;
  const inner = (
    <>
      <span className={styles.mark} aria-hidden="true">
        {initials(cur.name)}
      </span>
      {!compact && (
        <span className={styles.text}>
          <span className={cn('body-strong', styles.truncate)}>{cur.name}</span>
          {cur.role && (
            <span className={cn('caption', styles.role, styles.truncate)}>{cur.role}</span>
          )}
        </span>
      )}
      {!single && <Icon icon="chevrons-up-down" size={14} className={styles.chev} />}
    </>
  );

  if (single) return <span className={cn(styles.org, styles.isStatic, className)}>{inner}</span>;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cn(styles.org, open && styles.isOpen, className)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${labels.switchBusiness}: ${cur.name}`}
        onClick={() => setOpen(!open)}
      >
        {inner}
      </button>
      {open && (
        <ThemedPortal>
          <div
            ref={popRef}
            id={listId}
            style={style}
            className={cn(list.popover, styles.menu)}
            role="dialog"
            aria-label={labels.yourBusinesses}
            data-popover
          >
            <div className={cn(styles.heading, 'caption')}>{labels.yourBusinesses}</div>
            {orgs.length > 6 && (
              <div className={styles.search}>
                <Icon icon="search" size={16} />
                <input
                  className="body"
                  placeholder={labels.findBusiness}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                  aria-label={labels.findBusiness}
                />
              </div>
            )}
            <div role="listbox" aria-label={labels.yourBusinesses} className={styles.list}>
              {shown.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === cur.id}
                  className={cn(styles.item, list.option, o.id === cur.id && list.optionSelected)}
                  onClick={() => {
                    setOpen(false);
                    onChange?.(o.id);
                  }}
                >
                  <span className={styles.mark} aria-hidden="true">
                    {initials(o.name)}
                  </span>
                  <span className={list.optionText}>
                    <span className="body">{o.name}</span>
                    <span className={cn(list.optionDesc, 'body-small')}>{o.role}</span>
                  </span>
                  {o.id === cur.id && <Icon icon="check" size={16} className={list.optionTick} />}
                </button>
              ))}
            </div>
            {shown.length === 0 && (
              <div className={cn(list.empty, 'body-small')}>{labels.noResultsFor(q)}</div>
            )}
          </div>
        </ThemedPortal>
      )}
    </>
  );
}
