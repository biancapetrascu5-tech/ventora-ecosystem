'use client';

import type { ReactNode } from 'react';
import btn from '../Button/Button.module.css';
import { Icon } from '../Icon/Icon';
import { Kbd } from '../Kbd/Kbd';
import { cn } from '../lib/cn';
import { Menu, type MenuEntry } from '../Menu/Menu';
import styles from './ContextBar.module.css';

export interface ContextBarLabels {
  /** S.search — numele accesibil al butonului de căutare. */
  search: string;
  /** S.searchPlaceholder — textul din câmpul de căutare. */
  searchPlaceholder: string;
  /** S.create — butonul „Creează”. */
  create: string;
}

export interface ContextBarProps {
  /** Numele aplicației sau al paginii (într-o aplicație cu Spine se vede doar pe telefon). */
  title?: string;
  /** OrgSwitcher (pe telefon trece în meniul contului). */
  org?: ReactNode;
  /** Deschide paleta de comenzi (⌘K). */
  onSearch?: () => void;
  /** Înlocuiește atât numele accesibil, cât și textul căutării. */
  searchLabel?: string;
  /** Lista din meniul „Creează”; fără ea, butonul apelează onCreate. */
  createItems?: MenuEntry[];
  onCreateAction?: (id: string) => void;
  onCreate?: () => void;
  createLabel?: string;
  /** NotificationsPanel. */
  notifications?: ReactNode;
  /** AccountMenu. */
  account?: ReactNode;
  /** Înaintea titlului (ex. Logo în launcherul Hub). */
  leading?: ReactNode;
  labels: ContextBarLabels;
  className?: string;
}

/* ContextBar din bundle.js: titlu, afacerea, căutarea cu ⌘K, „Creează”, notificări, contul.
   Sub 1024px (containerul shell) căutarea devine iconiță; sub 768px afacerea iese din bară, iar
   „Creează” devine buton rotund. */
export function ContextBar({
  title,
  org,
  onSearch,
  searchLabel,
  createItems,
  onCreateAction,
  onCreate,
  createLabel,
  notifications,
  account,
  leading,
  labels,
  className,
}: ContextBarProps) {
  const create = createLabel ?? labels.create;
  const createBtn = (
    <button
      type="button"
      className={cn(btn.root, btn.primary, btn.md, styles.create)}
      onClick={createItems ? undefined : onCreate}
      aria-label={create}
    >
      <Icon icon="plus" size={16} />
      <span className={cn(btn.label, styles.createLabel, 'body-strong')}>{create}</span>
    </button>
  );
  return (
    <header className={cn(styles.root, className)} data-contextbar="">
      {leading}
      <div className={styles.title}>
        {title && <span className={cn('heading', styles.truncate)}>{title}</span>}
      </div>
      {org && <div className={styles.org}>{org}</div>}
      <div className={styles.spacer} />
      {onSearch && (
        <button
          type="button"
          className={styles.search}
          onClick={onSearch}
          aria-label={searchLabel ?? labels.search}
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Icon icon="search" size={16} />
          <span className={cn('body', styles.searchText)}>
            {searchLabel ?? labels.searchPlaceholder}
          </span>
          <Kbd keys={['mod', 'K']} className={styles.kbd} />
        </button>
      )}
      {(createItems || onCreate) &&
        (createItems ? (
          <Menu label={create} items={createItems} onAction={onCreateAction}>
            {createBtn}
          </Menu>
        ) : (
          createBtn
        ))}
      {notifications}
      {account}
    </header>
  );
}
