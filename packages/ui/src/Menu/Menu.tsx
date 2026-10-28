'use client';

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import { Kbd } from '../Kbd/Kbd';
import { cn } from '../lib/cn';
import { ThemedPortal, useAnchor, useOutside, type Placement } from '../lib/popover';
import styles from './Menu.module.css';

export interface MenuItemDef {
  id: string;
  label: string;
  icon?: IconName;
  /** Textul de sub etichetă (.v-menu__desc). */
  description?: string;
  /** Element bifabil (menuitemcheckbox); `true` arată bifa. */
  checked?: boolean;
  isDisabled?: boolean;
  /** Acțiune distructivă (.is-destructive). */
  isDanger?: boolean;
  /** Tastele scurtăturii, ca la Kbd (ex. ["mod", "K"]) sau un text. */
  shortcut?: string | string[];
}

export interface MenuSectionDef {
  label?: string;
  items: MenuItemDef[];
}

/** Intrările din bundle: element, titlu, separator sau conținut liber. */
export type MenuEntry =
  MenuItemDef | { heading: string } | { separator: true } | { render: ReactNode };

export interface MenuProps {
  /** Butonul care deschide meniul (Button / IconButton). */
  children: ReactElement;
  items?: MenuEntry[];
  sections?: MenuSectionDef[];
  onAction?: (id: string) => void;
  /** Eticheta meniului (aria-label). */
  label?: string;
  placement?: Placement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  header?: ReactNode;
  width?: number;
  className?: string;
}

const isItem = (e: MenuEntry): e is MenuItemDef => 'id' in e;

function fromSections(sections: MenuSectionDef[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  sections.forEach((s, i) => {
    if (i > 0) out.push({ separator: true });
    if (s.label) out.push({ heading: s.label });
    out.push(...s.items);
  });
  return out;
}

/* Menu din bundle.js: listă .v-popover.v-menu în portal, ancorată sub buton, nemodală. */
export function Menu({
  children,
  items,
  sections,
  onAction,
  label,
  placement = 'bottom-start',
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  header,
  width,
  className,
}: MenuProps) {
  const entries = useMemo(() => items ?? fromSections(sections ?? []), [items, sections]);
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setOpenState(o);
    onOpenChange?.(o);
  };
  const anchor = useRef<HTMLSpanElement>(null);
  const menuId = 'm' + useId().replace(/:/g, '');
  const { popRef, style } = useAnchor(anchor, open, { placement });
  const actionable = entries
    .map((e, i) => (isItem(e) && !e.isDisabled ? i : -1))
    .filter((i) => i >= 0);
  const [active, setActive] = useState(-1);

  useOutside([anchor, popRef], () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      anchor.current?.querySelector('button')?.focus();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // setOpen e stabil pentru scopul ăsta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(actionable[0] ?? -1);
    const t = setTimeout(() => popRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
    // doar la deschidere
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = (it: MenuItemDef) => {
    if (it.isDisabled) return;
    setOpen(false);
    onAction?.(it.id);
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== popRef.current) return;
    const pos = actionable.indexOf(active);
    const n = actionable.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(actionable[(pos + 1) % n] ?? -1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(actionable[(pos - 1 + n) % n] ?? -1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(actionable[0] ?? -1);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(actionable[n - 1] ?? -1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const it = entries[active];
      if (it && isItem(it)) run(it);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const triggerProps = children.props as { onPress?: () => void };
  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onPress: () => {
          triggerProps.onPress?.();
          setOpen(!open);
        },
      })
    : children;

  return (
    <span ref={anchor} className={styles.anchor}>
      {trigger}
      {open && (
        <ThemedPortal>
          <div
            ref={popRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className={cn(styles.menu, className)}
            style={{ ...style, width }}
            onKeyDown={onKey}
            aria-activedescendant={active >= 0 ? `${menuId}-${active}` : undefined}
          >
            {header}
            {entries.map((e, i) => {
              if ('separator' in e)
                return <div key={`s${i}`} role="separator" className={styles.sep} />;
              if ('heading' in e)
                return (
                  <div key={`h${i}`} className={cn(styles.heading, 'caption')} role="presentation">
                    {e.heading}
                  </div>
                );
              if ('render' in e)
                return (
                  <div key={`r${i}`} className={styles.custom} role="none">
                    {e.render}
                  </div>
                );
              return (
                <div
                  key={e.id}
                  id={`${menuId}-${i}`}
                  role={e.checked != null ? 'menuitemcheckbox' : 'menuitem'}
                  aria-checked={e.checked != null ? Boolean(e.checked) : undefined}
                  aria-disabled={e.isDisabled || undefined}
                  className={cn(
                    styles.item,
                    i === active && styles.isActive,
                    e.isDanger && styles.isDestructive,
                    e.isDisabled && styles.isDisabled,
                  )}
                  onMouseEnter={() => !e.isDisabled && setActive(i)}
                  onClick={() => run(e)}
                >
                  {e.icon ? (
                    <Icon icon={e.icon} size={16} className={styles.icon} />
                  ) : e.checked != null ? (
                    <span className={styles.icon} />
                  ) : null}
                  <span className={styles.text}>
                    <span className="body">{e.label}</span>
                    {e.description && (
                      <span className={cn(styles.desc, 'body-small')}>{e.description}</span>
                    )}
                  </span>
                  {e.checked && <Icon icon="check" size={16} className={styles.tick} />}
                  {e.shortcut && (
                    <Kbd keys={Array.isArray(e.shortcut) ? e.shortcut : [e.shortcut]} />
                  )}
                </div>
              );
            })}
          </div>
        </ThemedPortal>
      )}
    </span>
  );
}
