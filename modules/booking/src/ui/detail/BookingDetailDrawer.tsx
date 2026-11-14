'use client';

import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  Drawer,
  FormField,
  IconButton,
  Menu,
  Notice,
  StatusPill,
  Textarea,
  type IconName,
} from '@ventora/ui';
import type { ScreenMode } from '../services/BookingServicesView';
import { STATUS_LOOK, type DetailStatus } from './detail-format';
import s from './detail.module.css';

/* BookingDetail (B.6a) and BookingStatuses (S116 f): an appointment in a Drawer over the list —
   preview.html Detail / DetailBody_L, 1:1: the StatusPill (the 7 states, BookingStatuses) and the
   badge, the lines under it, the „when / service / person / client” list, the attention notice with
   its buttons, the team's note, the history (the last 3, then „Vezi tot istoricul”); the main
   action in the footer, the others in the „…” menu. What the footer and the menu offer comes from
   the caller (detail-format `actionsFor`: only the transitions allowed from the state); a button
   without a handler is not drawn. BookingMoney (screen 5) adds the pill after the state, „Plată”
   after the notice, the quiet button at the start of the footer and the 560 px width; without a
   history the section is not drawn. Props only: the page and the gallery draw the same component. */

export type DetailButton = {
  id: string;
  label: string;
  icon: IconName;
  primary?: boolean;
  onPress?: () => void;
};
export type DetailMenuItem = {
  id: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  separatorBefore?: boolean;
};

export type BookingDetailDrawerProps = {
  mode: ScreenMode;
  /** The client's name and „Serviciu · Vin, 23 oct., 12:30”. */
  title: string;
  subtitle: string;
  status: DetailStatus;
  /** „Rezervată online”. */
  badge?: string | null;
  /** The lines under the pill (deposit, who cancelled, the risk notice). */
  lines?: ReactNode;
  /** [label, value] in order: when, service, person, client. */
  rows: [string, string][];
  /** „Stare finală. …” under the list (BookingStatuses). */
  finalNote?: string | null;
  notice?: { tone: 'attention' | 'neutral' | 'danger'; title: string; body?: string } | null;
  /** The buttons under the notice („Retrimite reamintirea”, „Sună”). */
  noticeButtons?: DetailButton[];
  /** The team's note; absent = not shown (BookingStatuses). */
  note?: { value: string; onChange?: (v: string) => void; onBlur?: () => void } | null;
  /** Absent: no history section (BookingMoney draws the payments instead). */
  history?: [string, string][];
  /** „Vezi tot istoricul” (or „Arată mai puțin”), when there is more. */
  historyMore?: { label: string; onPress?: () => void } | null;
  /** BookingMoney: the pill after the state („De încasat · 300 lei” / „Achitat”). */
  pill?: ReactNode;
  /** BookingMoney: „Plată” (MoneyBlock), after the notice. */
  money?: ReactNode;
  /** BookingMoney: the quiet button at the start of the footer („Nu a venit…”). */
  footerStart?: DetailButton | null;
  /** The panel's width (BookingMoney: 560). */
  width?: number;
  footer: DetailButton[];
  menu: DetailMenuItem[];
  onMenu?: (id: string) => void;
  onClose?: () => void;
  /** BookingStatuses: the body in one stack (gap 3); BookingDetail: the Drawer's own gap. */
  dense?: boolean;
  /** true (default): in the frame / container (gallery, preview.html); false: a modal over the
      page (the application), opened with `isOpen`. */
  contained?: boolean;
  isOpen?: boolean;
};

export function BookingDetailDrawer(p: BookingDetailDrawerProps) {
  const t = useTranslations('booking');
  const ui = useTranslations('ui');
  const look = STATUS_LOOK[p.status];
  const mobile = p.mode === 'mobile';
  const items = p.menu.flatMap((m) => [
    ...(m.separatorBefore ? [{ separator: true as const }] : []),
    { id: m.id, label: m.label, icon: m.icon, isDanger: m.destructive },
  ]);
  const buttons = p.footer.map((b) => (
    <Button
      key={b.id}
      icon={b.icon}
      variant={b.primary ? 'primary' : 'secondary'}
      onPress={b.onPress}
    >
      {b.label}
    </Button>
  ));
  return (
    <Drawer
      {...(p.contained === false
        ? { isOpen: p.isOpen ?? true, onOpenChange: (o: boolean) => !o && p.onClose?.() }
        : { contained: true, onClose: p.onClose })}
      layout={mobile ? 'full' : p.mode === 'tablet' ? 'side' : 'auto'}
      title={p.title}
      subtitle={p.subtitle}
      closeLabel={ui('close')}
      backLabel={ui('back')}
      actions={
        items.length > 0 ? (
          <Menu items={items} onAction={p.onMenu} label={t('detail.more')}>
            <IconButton icon="ellipsis-vertical" label={t('detail.more')} />
          </Menu>
        ) : null
      }
      width={p.width}
      footer={
        p.footerStart ? (
          // BookingMoney: the quiet button at the start (sv-foot / sv-grow)
          <div className={`${s.foot} ${mobile ? s.footM : ''}`}>
            <Button variant="quiet" icon={p.footerStart.icon} onPress={p.footerStart.onPress}>
              {p.footerStart.label}
            </Button>
            <span className={s.grow} />
            {buttons}
          </div>
        ) : p.footer.length > 0 ? (
          // the Drawer lays the buttons out itself (full width on a phone)
          <>{buttons}</>
        ) : undefined
      }
    >
      <Body dense={p.dense}>
        <div className={s.row}>
          <StatusPill tone={look.tone} icon={look.icon}>
            {t(`status.${look.key}`)}
          </StatusPill>
          {p.badge && <Badge>{p.badge}</Badge>}
          {p.pill}
        </div>
        {p.lines}
        <dl className={s.kv}>
          {p.rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="caption">{k}</dt>
              <dd className="body">{v}</dd>
            </Fragment>
          ))}
        </dl>
        {p.finalNote && <p className={`caption ${s.muted}`}>{p.finalNote}</p>}
        {p.notice && (
          <Notice className={s.notice} tone={p.notice.tone} title={p.notice.title}>
            {p.notice.body}
          </Notice>
        )}
        {p.noticeButtons && p.noticeButtons.length > 0 && (
          <div className={s.row}>
            {p.noticeButtons.map((b) => (
              <Button
                key={b.id}
                size="sm"
                icon={b.icon}
                variant={b.primary ? 'secondary' : 'quiet'}
                onPress={b.onPress}
              >
                {b.label}
              </Button>
            ))}
          </div>
        )}
        {p.money}
        {p.note && (
          <FormField label={t('detail.notes')}>
            <Textarea
              rows={3}
              maxLength={1000}
              value={p.note.value}
              onChange={(e) => p.note?.onChange?.(e.target.value)}
              onBlur={p.note.onBlur}
            />
          </FormField>
        )}
        {p.history && (
          <div>
            <p className={`subheading ${s.histHead}`}>{t('detail.history')}</p>
            <ul className={`body-small ${s.hist}`}>
              {p.history.map(([when, what], i) => (
                <li key={i}>
                  <span className={s.muted}>{when}</span> {what}
                </li>
              ))}
            </ul>
            {p.historyMore && (
              <button
                type="button"
                className={`v-link body-small ${s.more}`}
                onClick={p.historyMore.onPress}
              >
                {p.historyMore.label}
              </button>
            )}
          </div>
        )}
      </Body>
    </Drawer>
  );
}

function Body({ dense, children }: { dense?: boolean; children: ReactNode }) {
  return dense ? <div className={s.stack}>{children}</div> : <>{children}</>;
}
