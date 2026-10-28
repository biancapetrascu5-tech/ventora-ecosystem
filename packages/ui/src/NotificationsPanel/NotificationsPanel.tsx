'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AppIcon } from '../AppIcon/AppIcon';
import { Avatar } from '../Avatar/Avatar';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { Icon, type IconName } from '../Icon/Icon';
import { cn } from '../lib/cn';
import { ThemedPortal, useAnchor, useOutside } from '../lib/popover';
import { RecommendationLabel } from '../RecommendationLabel/RecommendationLabel';
import { Tabs } from '../Tabs/Tabs';
import btn from '../Button/Button.module.css';
import ib from '../IconButton/IconButton.module.css';
import styles from './NotificationsPanel.module.css';

export interface NotificationData {
  id: string | number;
  title: string;
  body?: string;
  /** Numele aplicației din rândul de jos (ex. „EasyBook”). */
  app?: string;
  time?: string;
  /** Persoana: Avatar în loc de iconiță. */
  person?: string;
  icon?: IconName;
  read?: boolean;
  /** S2: `operational` stă sus, în „Despre cont și funcționare”. */
  category?: 'operational' | 'activity';
}

export interface HubRecommendationData {
  id: string | number;
  /** `team` = recomandare de la echipă (Vezi aplicația / Respinge). */
  kind?: 'team';
  app?: string;
  icon?: IconName;
  title: string;
  body?: string;
  /** Nota colegului (doar la `team`), afișată între ghilimele. */
  note?: string;
}

export interface NotificationsLabels {
  /** S.notifications — titlul, butonul clopoțel și dialogul. */
  notifications: string;
  /** S.unreadN, ex. (n) => `${n} necitite` — în numele clopoțelului. */
  unreadN: (n: number) => string;
  markAllRead: string;
  notificationSettings: string;
  /** S.all / S.unread — taburile. */
  all: string;
  unread: string;
  noNotifications: string;
  noNotificationsHint: string;
  /** S.notif_operational / S.notif_activity — grupurile (S2). */
  operational: string;
  activity: string;
  recommendations: string;
  /** Recomandări: S.recommendation, S.fromTeam, S.seeApp, S.reject, S.seeDetails, S.notInterested. */
  recommendation: string;
  fromTeam: string;
  seeApp: string;
  reject: string;
  seeDetails: string;
  notInterested: string;
}

export interface NotificationsPanelProps {
  items: NotificationData[];
  recommendations?: HubRecommendationData[];
  onOpenItem?: (n: NotificationData) => void;
  onMarkAllRead?: () => void;
  onSettings?: () => void;
  onOpenRecommendation?: (r: HubRecommendationData) => void;
  onDismissRecommendation?: (r: HubRecommendationData) => void;
  onSeeApp?: (r: HubRecommendationData) => void;
  onRejectRecommendation?: (r: HubRecommendationData) => void;
  /** Doar panoul, fără clopoțel (documentație, pagini). */
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Ce necitite numără clopoțelul. Implicit toate (ca în design); `operational` = doar
   * cele din „Despre cont și funcționare”.
   */
  countCategory?: 'operational';
  labels: NotificationsLabels;
  className?: string;
}

function NotificationItem({
  n,
  onOpen,
}: {
  n: NotificationData;
  onOpen?: (n: NotificationData) => void;
}) {
  return (
    <li>
      <button type="button" className={styles.notif} onClick={() => onOpen?.(n)}>
        {n.person ? (
          <Avatar name={n.person} size="md" />
        ) : (
          <span className={styles.icon} aria-hidden="true">
            <Icon icon={n.icon ?? 'bell'} size={16} />
          </span>
        )}
        <span className={styles.text}>
          <span className={n.read ? 'body' : 'body-strong'}>{n.title}</span>
          {n.body && <span className={cn(styles.body, 'body-small')}>{n.body}</span>}
          <span className={cn(styles.meta, 'caption')}>
            {[n.app, n.time].filter(Boolean).join(' · ')}
          </span>
        </span>
        {!n.read && <span className={styles.dot} aria-hidden="true" />}
      </button>
    </li>
  );
}

/* HubRecommendation din bundle.js: recomandarea din panoul de notificări (sau de la echipă). */
export function HubRecommendation({
  r,
  labels,
  onOpen,
  onDismiss,
  onSeeApp,
  onReject,
}: {
  r: HubRecommendationData;
  labels: Pick<
    NotificationsLabels,
    'recommendation' | 'fromTeam' | 'seeApp' | 'reject' | 'seeDetails' | 'notInterested'
  >;
  onOpen?: (r: HubRecommendationData) => void;
  onDismiss?: (r: HubRecommendationData) => void;
  onSeeApp?: (r: HubRecommendationData) => void;
  onReject?: (r: HubRecommendationData) => void;
}) {
  const team = r.kind === 'team';
  return (
    <li className={styles.reco}>
      <span className={styles.recoIcon}>
        {r.app ? <AppIcon app={r.app} size={32} /> : <Icon icon={r.icon ?? 'package'} size={16} />}
      </span>
      <span className={styles.recoText}>
        <span>
          {team ? (
            <span className={cn('caption', styles.recoKind)}>{labels.fromTeam}</span>
          ) : (
            <RecommendationLabel label={labels.recommendation} />
          )}
        </span>
        <span className="body-strong">{r.title}</span>
        {r.body && <span className={cn('body-small', styles.recoBody)}>{r.body}</span>}
        {r.note && <span className={cn('body-small', styles.recoNote)}>{`„${r.note}”`}</span>}
        <span className={styles.recoActions}>
          {team ? (
            <>
              <Button size="sm" onPress={() => onSeeApp?.(r)}>
                {labels.seeApp}
              </Button>
              <Button size="sm" variant="quiet" onPress={() => onReject?.(r)}>
                {labels.reject}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onPress={() => onOpen?.(r)}>
                {labels.seeDetails}
              </Button>
              <Button size="sm" variant="quiet" onPress={() => onDismiss?.(r)}>
                {labels.notInterested}
              </Button>
            </>
          )}
        </span>
      </span>
    </li>
  );
}

/* NotificationsPanel din bundle.js: clopoțelul din ContextBar și panoul lui — Toate / Necitite,
   grupurile S2, recomandările la final. */
export function NotificationsPanel({
  items,
  recommendations = [],
  onOpenItem,
  onMarkAllRead,
  onSettings,
  onOpenRecommendation,
  onDismissRecommendation,
  onSeeApp,
  onRejectRecommendation,
  inline = false,
  open: openProp,
  onOpenChange,
  countCategory,
  labels,
  className,
}: NotificationsPanelProps) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setOpenState(o);
    onOpenChange?.(o);
  };
  const bell = useRef<HTMLButtonElement>(null);
  const panelId = 'n' + useId().replace(/:/g, '');
  const { popRef, style } = useAnchor(bell, open && !inline, { placement: 'bottom-end' });
  useOutside([bell, popRef], () => setOpen(false), open && !inline);
  useEffect(() => {
    if (!open || inline) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // setOpen e stabil pentru scopul ăsta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inline]);

  const unread = items.filter((n) => !n.read).length;
  const badge = items.filter(
    (n) => !n.read && (!countCategory || n.category === countCategory),
  ).length;
  const list = tab === 'unread' ? items.filter((n) => !n.read) : items;
  const ops = list.filter((n) => n.category === 'operational');
  const rest = list.filter((n) => n.category !== 'operational');
  const ul = (xs: NotificationData[]) => (
    <ul className={styles.list}>
      {xs.map((n) => (
        <NotificationItem key={n.id} n={n} onOpen={onOpenItem} />
      ))}
    </ul>
  );

  const panel = (
    <div
      ref={inline ? undefined : popRef}
      id={inline ? undefined : panelId}
      style={inline ? undefined : style}
      className={cn(styles.notifs, inline ? styles.inline : styles.pop, className)}
      role="dialog"
      aria-label={labels.notifications}
      data-popover={inline ? undefined : true}
    >
      <div className={styles.head}>
        <span className="heading">{labels.notifications}</span>
        <div className={styles.headact}>
          {unread > 0 && onMarkAllRead && (
            <button
              type="button"
              className={cn(btn.root, btn.quiet, btn.sm, styles.hover)}
              onClick={onMarkAllRead}
            >
              <Icon icon="check-check" size={16} />
              <span className={cn(btn.label, 'body-strong')}>{labels.markAllRead}</span>
            </button>
          )}
          {onSettings && (
            <button
              type="button"
              className={cn(ib.root, ib.quiet, ib.sm, styles.hover)}
              aria-label={labels.notificationSettings}
              title={labels.notificationSettings}
              onClick={onSettings}
            >
              <Icon icon="settings" size={16} />
            </button>
          )}
        </div>
      </div>
      <Tabs
        size="sm"
        label={labels.notifications}
        selectedKey={tab}
        onSelectionChange={(k) => setTab(k as 'all' | 'unread')}
        listClassName={styles.tabs}
        items={[
          { id: 'all', label: labels.all },
          {
            id: 'unread',
            label: labels.unread,
            count: unread || undefined,
            countTone: 'attention',
          },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState
          size="sm"
          icon="bell"
          title={labels.noNotifications}
          description={labels.noNotificationsHint}
        />
      ) : ops.length === 0 ? (
        ul(list)
      ) : (
        <>
          <section aria-label={labels.operational}>
            <p className={cn('subheading', styles.recohead)}>{labels.operational}</p>
            {ul(ops)}
          </section>
          {rest.length > 0 && (
            <section aria-label={labels.activity}>
              <p className={cn('subheading', styles.recohead)}>{labels.activity}</p>
              {ul(rest)}
            </section>
          )}
        </>
      )}
      {tab === 'all' && recommendations.length > 0 && (
        <section className={styles.recos} aria-label={labels.recommendations}>
          <p className={cn('subheading', styles.recohead)}>{labels.recommendations}</p>
          <ul className={styles.list}>
            {recommendations.map((r) => (
              <HubRecommendation
                key={r.id}
                r={r}
                labels={labels}
                onOpen={onOpenRecommendation}
                onDismiss={onDismissRecommendation}
                onSeeApp={onSeeApp}
                onReject={onRejectRecommendation}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  if (inline) return panel;
  return (
    <>
      <button
        ref={bell}
        type="button"
        className={cn(ib.root, ib.quiet, ib.md, styles.hover, open && ib.isOn)}
        aria-label={labels.notifications + (badge ? `, ${labels.unreadN(badge)}` : '')}
        title={labels.notifications}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      >
        <Icon icon="bell" size={16} />
        {badge > 0 && (
          <span className={cn(ib.badge, 'caption')} aria-hidden="true">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
      {open && <ThemedPortal>{panel}</ThemedPortal>}
    </>
  );
}
