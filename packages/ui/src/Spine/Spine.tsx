'use client';

import { useState, type ReactNode } from 'react';
import { AppIcon, type AppName } from '../AppIcon/AppIcon';
import { Drawer } from '../Drawer/Drawer';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Spine.module.css';

export interface NavItem {
  id: string;
  label: string;
  /** Forma scurtă din glosar (S70), doar în bara de jos pe telefon; altfel `label`. */
  short?: string;
  icon: IconName;
  href?: string;
  badge?: number;
  /** Insigna e peach (implicit) sau neutră. */
  badgeTone?: 'attention' | 'neutral';
  isDisabled?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export interface SpineLabels {
  /** S.backToHub — butonul aplicației și primul rând din „Mai multe”. */
  backToHub?: string;
  /** S.expandMenu / S.collapseMenu — butonul rotund de pe margine. */
  expandMenu?: string;
  collapseMenu?: string;
  /** S.more — ultimul buton din bara de jos. */
  more?: string;
  /** S.close / S.back — panoul „Mai multe”. */
  close?: string;
  back?: string;
}

export interface SpineProps {
  /** Aplicația (iconița din antet). */
  app?: AppName;
  /** Numele aplicației din antet (ex. „EasyBook”). */
  appName?: string;
  sections?: NavSection[];
  /** Listă plată (o singură secțiune fără titlu). */
  items?: NavItem[];
  activeId?: string;
  onNavigate?: (item: NavItem) => void;
  onBackToHub?: () => void;
  /** Sub listă (ex. UsageMeter compact). */
  footer?: ReactNode;
  collapsed?: boolean;
  /** @deprecated folosește `collapsed`. */
  isCollapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Id-urile din bara de jos pe telefon; implicit primele 4. */
  bottomItems?: string[];
  labels: SpineLabels;
  className?: string;
}

function Item({
  it,
  active,
  collapsed,
  onNavigate,
}: {
  it: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: (item: NavItem) => void;
}) {
  const content = (
    <>
      <Icon icon={it.icon} size={20} />
      <span className={cn(styles.label, active ? 'body-strong' : 'body')}>{it.label}</span>
      {it.badge != null && (
        <span
          className={cn(
            styles.badge,
            it.badgeTone === 'neutral' ? styles.badgeNeutral : styles.badgeAttention,
            'caption',
          )}
        >
          {it.badge}
        </span>
      )}
    </>
  );
  const cls = cn(styles.item, active && styles.isActive, it.isDisabled && styles.isDisabled);
  return (
    <li>
      {it.href ? (
        <a
          href={it.href}
          className={cls}
          aria-current={active ? 'page' : undefined}
          title={collapsed ? it.label : undefined}
          onClick={() => onNavigate?.(it)}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          className={cls}
          aria-current={active ? 'page' : undefined}
          aria-disabled={it.isDisabled || undefined}
          title={collapsed ? it.label : undefined}
          onClick={() => !it.isDisabled && onNavigate?.(it)}
        >
          {content}
        </button>
      )}
    </li>
  );
}

/* Spine din bundle.js: aplicația în antet (înapoi la Hub), secțiuni cu titlu, element activ cu marcaj
   peach, insigne, subsol, buton rotund de restrângere; sub 768px devine bara de jos + „Mai multe”. */
export function Spine({
  app,
  appName = '',
  sections: sectionsProp,
  items,
  activeId,
  onNavigate,
  onBackToHub,
  footer,
  collapsed,
  isCollapsed: isCollapsedOld,
  defaultCollapsed = false,
  onCollapsedChange,
  bottomItems,
  labels,
  className,
}: SpineProps) {
  const sections = sectionsProp ?? (items ? [{ items }] : []);
  const [inner, setInner] = useState(defaultCollapsed);
  const controlled = collapsed ?? isCollapsedOld;
  const isCollapsed = controlled ?? inner;
  const setCollapsed = (v: boolean) => {
    if (controlled === undefined) setInner(v);
    onCollapsedChange?.(v);
  };
  const [more, setMore] = useState(false);
  const all = sections.flatMap((s) => s.items);
  const bottom = bottomItems ? all.filter((i) => bottomItems.includes(i.id)) : all.slice(0, 4);
  const restActive = !bottom.some((i) => i.id === activeId);
  const backLabel = labels?.backToHub ?? '';
  const toggleLabel = isCollapsed ? labels?.expandMenu : labels?.collapseMenu;

  return (
    <>
      <nav
        className={cn(styles.spine, isCollapsed && styles.isCollapsed, className)}
        aria-label={appName}
        data-spine=""
      >
        <div className={styles.head}>
          <button
            type="button"
            className={styles.app}
            onClick={onBackToHub}
            title={backLabel}
            aria-label={`${appName} — ${backLabel}`}
          >
            {app && <AppIcon app={app} size={32} />}
            <span className={cn(styles.appname, 'heading')}>{appName}</span>
            <Icon icon="layout-grid" size={16} className={styles.hub} />
          </button>
        </div>
        <div className={styles.scroll}>
          {sections.map((s, i) => (
            <div className={styles.section} key={s.label ?? i}>
              {s.label && <div className={cn(styles.seclabel, 'caption')}>{s.label}</div>}
              <ul>
                {s.items.map((it) => (
                  <Item
                    key={it.id}
                    it={it}
                    active={it.id === activeId}
                    collapsed={isCollapsed}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
        {footer && <div className={styles.foot}>{footer}</div>}
        <button
          type="button"
          className={styles.collapse}
          onClick={() => setCollapsed(!isCollapsed)}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!isCollapsed}
        >
          <Icon icon={isCollapsed ? 'chevron-right' : 'chevron-left'} size={16} />
        </button>
      </nav>

      <nav className={styles.bottomnav} aria-label={appName}>
        {bottom.map((it) => (
          <button
            key={it.id}
            type="button"
            className={cn(styles.bitem, it.id === activeId && styles.bitemActive)}
            aria-current={it.id === activeId ? 'page' : undefined}
            onClick={() => onNavigate?.(it)}
          >
            <span className={styles.bicon}>
              <Icon icon={it.icon} size={22} />
              {it.badge != null && <span className={cn(styles.bbadge, 'caption')}>{it.badge}</span>}
            </span>
            <span className={cn(styles.blabel, styles.btrunc, 'caption')}>
              {it.short || it.label}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={cn(styles.bitem, restActive && styles.bitemActive)}
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
        >
          <span className={styles.bicon}>
            <Icon icon="menu" size={22} />
          </span>
          <span className={cn(styles.blabel, 'caption')}>{labels?.more}</span>
        </button>
      </nav>

      {more && (
        <Drawer
          isOpen={more}
          onOpenChange={setMore}
          title={appName}
          closeLabel={labels?.close}
          backLabel={labels?.back}
        >
          <div className={cn(styles.spine, styles.sheet)}>
            {onBackToHub && (
              <button
                type="button"
                className={styles.item}
                onClick={() => {
                  setMore(false);
                  onBackToHub();
                }}
              >
                <Icon icon="layout-grid" size={20} />
                <span className={cn(styles.label, 'body')}>{backLabel}</span>
              </button>
            )}
            {sections.map((s, i) => (
              <div className={styles.section} key={s.label ?? i}>
                {s.label && <div className={cn(styles.seclabel, 'caption')}>{s.label}</div>}
                <ul>
                  {s.items.map((it) => (
                    <Item
                      key={it.id}
                      it={it}
                      active={it.id === activeId}
                      collapsed={false}
                      onNavigate={(x) => {
                        setMore(false);
                        onNavigate?.(x);
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {footer && <div className={styles.foot}>{footer}</div>}
          </div>
        </Drawer>
      )}
    </>
  );
}
