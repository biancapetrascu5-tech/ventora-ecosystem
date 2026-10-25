'use client';

import { useState, useEffect, useMemo } from 'react';
import { ModalOverlay, Modal, Dialog as RACDialog } from 'react-aria-components';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './CommandPalette.module.css';

export interface CommandDef {
  id: string;
  label: string;
  icon?: IconName;
  group?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  commands: CommandDef[];
  placeholder?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({
  commands,
  placeholder = 'Caută comandă...', // TODO: i18n
  isOpen: isOpenProp,
  onOpenChange,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen;

  const setOpen = (v: boolean) => {
    if (isOpenProp === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };

  // Keyboard shortcut Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Group by group
  const groups = useMemo(() => {
    const map = new Map<string, CommandDef[]>();
    for (const cmd of filtered) {
      const key = cmd.group ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cmd);
    }
    return map;
  }, [filtered]);

  const flatFiltered = filtered;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flatFiltered[activeIndex]?.onSelect();
      setOpen(false);
      setQuery('');
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay
      className={styles.overlay}
      isDismissable
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setOpen(false);
          setQuery('');
        }
      }}
    >
      <Modal className={styles.modal}>
        <RACDialog className={styles.dialog} aria-label="Paletă de comenzi">
          <div className={styles.search} onKeyDown={handleKeyDown}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className={styles.searchInput}
              aria-label={placeholder}
              aria-autocomplete="list"
              aria-controls="command-palette-list"
              aria-activedescendant={
                flatFiltered[activeIndex] ? `cmd-${flatFiltered[activeIndex].id}` : undefined
              }
            />
          </div>
          <div
            id="command-palette-list"
            role="listbox"
            aria-label="Comenzi"
            className={styles.listbox}
          >
            {filtered.length === 0 ? (
              <div className={styles.empty}>Nicio comandă găsită</div> // TODO: i18n
            ) : (
              Array.from(groups.entries()).map(([group, cmds]) => (
                <div key={group} className={styles.group}>
                  {group && <div className={styles.groupLabel}>{group}</div>}
                  {cmds.map((cmd) => {
                    const globalIndex = flatFiltered.indexOf(cmd);
                    return (
                      <div
                        key={cmd.id}
                        id={`cmd-${cmd.id}`}
                        role="option"
                        aria-selected={globalIndex === activeIndex}
                        className={cn(styles.item, globalIndex === activeIndex && styles.active)}
                        onClick={() => {
                          cmd.onSelect();
                          setOpen(false);
                          setQuery('');
                        }}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                      >
                        {cmd.icon && (
                          <span className={styles.itemIcon}>
                            <Icon icon={cmd.icon} size="sm" />
                          </span>
                        )}
                        <span>{cmd.label}</span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </RACDialog>
      </Modal>
    </ModalOverlay>
  );
}
