'use client';

import { Avatar } from '../Avatar/Avatar';
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher';
import { cn } from '../lib/cn';
import type { Placement } from '../lib/popover';
import { Menu, type MenuEntry } from '../Menu/Menu';
import { OrgSwitcher, type Org, type OrgSwitcherLabels } from '../OrgSwitcher/OrgSwitcher';
import {
  ThemeSwitcher,
  type ThemeChoice,
  type ThemeSwitcherLabels,
} from '../ThemeSwitcher/ThemeSwitcher';
import styles from './AccountMenu.module.css';

export interface AccountMenuLabels {
  /** S.account — butonul (urmat de nume), meniul și rândul „Contul tău”. */
  account: string;
  /** S.yourBusinesses, S.theme, S.language — etichetele rândurilor. */
  yourBusinesses: string;
  theme: string;
  language: string;
  /** S.allApps, S.support, S.signOut. */
  allApps: string;
  support: string;
  signOut: string;
  themeSwitcher: ThemeSwitcherLabels;
  orgSwitcher: OrgSwitcherLabels;
}

export interface AccountMenuProps {
  user: { name: string; email?: string; avatar?: string };
  onProfile?: () => void;
  onSupport?: () => void;
  /** Rândul „Toate aplicațiile Ventora” apare doar cu această funcție. */
  onCatalog?: () => void;
  onSignOut?: () => void;
  locale?: string;
  onLocaleChange?: (code: string) => void;
  theme?: ThemeChoice;
  onThemeChange?: (theme: ThemeChoice) => void;
  /** Afacerile; cu cel puțin două, „Afacerile tale” apare în meniu pe telefon. */
  orgs?: Org[];
  currentOrgId?: Org['id'];
  onOrgChange?: (id: Org['id']) => void;
  /** „Afacerile tale” în meniu indiferent de ecran (S66: după lățimea layoutului). */
  orgsInMenu?: boolean;
  placement?: Placement;
  defaultOpen?: boolean;
  labels: AccountMenuLabels;
}

/* AccountMenu din bundle.js: avatarul din ContextBar deschide meniul contului — persoana,
   afacerile (pe telefon), Contul tău, tema, limba, toate aplicațiile, suport, ieșire. */
export function AccountMenu({
  user,
  onProfile,
  onSupport,
  onCatalog,
  onSignOut,
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
  orgs,
  currentOrgId,
  onOrgChange,
  orgsInMenu = false,
  placement = 'bottom-end',
  defaultOpen = false,
  labels,
}: AccountMenuProps) {
  const items: MenuEntry[] = [
    {
      render: (
        <div className={styles.head}>
          <Avatar name={user.name} src={user.avatar} size="lg" />
          <span className={styles.who}>
            <span className={cn('body-strong', styles.truncate)}>{user.name}</span>
            <span className={cn('body-small', styles.mail, styles.truncate)}>{user.email}</span>
          </span>
        </div>
      ),
    },
    { separator: true },
    ...(orgs && orgs.length > 1
      ? [
          {
            render: (
              <div className={cn(styles.row, styles.org, orgsInMenu && styles.isOn)}>
                <span className={cn('caption', styles.label)}>{labels.yourBusinesses}</span>
                <OrgSwitcher
                  orgs={orgs}
                  currentId={currentOrgId}
                  onChange={onOrgChange}
                  labels={labels.orgSwitcher}
                />
              </div>
            ),
          },
        ]
      : []),
    { id: 'profile', label: labels.account, icon: 'circle-user' },
    {
      render: (
        <div className={styles.row}>
          <span className={cn('caption', styles.label)}>{labels.theme}</span>
          <ThemeSwitcher
            size="sm"
            block
            value={theme}
            onChange={onThemeChange}
            iconOnly
            labels={labels.themeSwitcher}
          />
        </div>
      ),
    },
    {
      render: (
        <div className={styles.row}>
          <span className={cn('caption', styles.label)}>{labels.language}</span>
          <LanguageSwitcher
            value={locale}
            onChange={onLocaleChange}
            placement="left-start"
            label={labels.language}
            className={styles.langswitch}
          />
        </div>
      ),
    },
    ...(onCatalog ? [{ id: 'catalog', label: labels.allApps, icon: 'layout-grid' as const }] : []),
    { id: 'support', label: labels.support, icon: 'life-buoy' },
    { separator: true },
    { id: 'signout', label: labels.signOut, icon: 'log-out' },
  ];
  const actions: Record<string, (() => void) | undefined> = {
    profile: onProfile,
    catalog: onCatalog,
    support: onSupport,
    signout: onSignOut,
  };
  return (
    <Menu
      label={labels.account}
      placement={placement}
      width="var(--popover-width)"
      defaultOpen={defaultOpen}
      items={items}
      onAction={(id) => actions[id]?.()}
    >
      <button type="button" className={styles.btn} aria-label={`${labels.account}: ${user.name}`}>
        <Avatar name={user.name} src={user.avatar} size="sm" />
      </button>
    </Menu>
  );
}
