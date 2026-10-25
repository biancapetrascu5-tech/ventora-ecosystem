'use client';

import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import styles from './Spine.module.css';

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
  badge?: number;
  isDisabled?: boolean;
}

export interface SpineProps {
  items: NavItem[];
  activeId?: string;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  footer?: React.ReactNode;
  className?: string;
}

export function Spine({
  items,
  activeId,
  isCollapsed = false,
  onCollapsedChange,
  footer,
  className,
}: SpineProps) {
  return (
    <aside
      className={cn(styles.root, isCollapsed && styles.collapsed, className)}
      aria-label="Navigare principală"
    >
      <nav className={styles.nav}>
        {items.map((item) => {
          const Tag = item.href ? 'a' : 'button';
          const isActive = item.id === activeId;
          return (
            <Tag
              key={item.id}
              {...(item.href ? { href: item.href } : { type: 'button' as const })}
              className={cn(styles.item, isActive && styles.itemActive)}
              aria-current={isActive ? 'page' : undefined}
              aria-disabled={item.isDisabled || undefined}
              data-active={isActive || undefined}
            >
              <span className={styles.itemIcon}>
                <Icon icon={item.icon} size="md" />
              </span>
              <span className={styles.itemLabel}>{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className={styles.itemBadge} aria-label={`${item.badge} necitite`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Tag>
          );
        })}
      </nav>

      {footer && <div className={styles.footer}>{footer}</div>}

      {onCollapsedChange && (
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={() => onCollapsedChange(!isCollapsed)}
          aria-label={isCollapsed ? 'Extinde meniu' : 'Comprimă meniu'} // TODO: i18n
        >
          <Icon icon={isCollapsed ? 'chevron-right' : 'chevron-left'} size="sm" />
        </button>
      )}

      {/* Bottom nav for mobile */}
      <nav className={styles.bottomNav} aria-label="Navigare mobilă">
        {items.slice(0, 5).map((item) => {
          const Tag = item.href ? 'a' : 'button';
          const isActive = item.id === activeId;
          return (
            <Tag
              key={item.id}
              {...(item.href ? { href: item.href } : { type: 'button' as const })}
              className={cn(styles.bottomNavItem, isActive && styles.bottomNavActive)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon icon={item.icon} size="md" />
              <span className={styles.bottomNavLabel}>{item.label}</span>
            </Tag>
          );
        })}
      </nav>
    </aside>
  );
}
