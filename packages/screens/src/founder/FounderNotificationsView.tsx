'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogTrigger,
  Drawer,
  EmptyState,
  FormField,
  Icon,
  Notice,
  PageHeader,
  Select,
  Sheet,
  SheetSection,
  Tabs,
  Textarea,
  Toast,
  type IconName,
} from '@ventora/ui';
import s from './notifications.module.css';

/* FounderNotifications (S136, P22, D5-11; doar română): clopoțelul Founder ca pagină — „Necitite · n”
   și „Toate”, filtrul „Tip”, rândurile cu iconiță, titlu, o propoziție, tipul și momentul, „Nou” la
   cele necitite, „Vezi”. Oprirea automată se deschide într-un Drawer (ce s-a oprit și de ce, cele
   4 motive cu pragurile lor), „Repornește” cere confirmare cu „Ce ai schimbat” (obligatoriu) și
   „Anunță-mă dacă se oprește din nou” (bifat), apoi Toast. Vederea primește texte gata de afișat;
   ecranul Founder le face din notificări (core/notifications), galeria din preview.html. */

type Mode = 'desktop' | 'mobile';

export type FounderNotifKind = 'auto' | 'support' | 'invoice' | 'setup';

export const FOUNDER_NOTIF_ICON: Record<FounderNotifKind, IconName> = {
  auto: 'triangle-alert',
  support: 'life-buoy',
  invoice: 'receipt',
  setup: 'wrench',
};

export type FounderNotifRow = {
  id: string | number;
  kind: FounderNotifKind;
  title: string;
  body: string;
  /** „acum 8 min”, „azi, 09:10”, „ieri”, „7 nov.” */
  when: string;
  unread: boolean;
};

/** Drawer-ul „Oprire automată”: valorile gata de afișat. */
export type FounderAutoStopDetail = {
  /** Numele campaniei (titlul confirmării, Toast-ul). */
  name: string;
  /** „Marketing pentru saloane · azi, 09:41” */
  subtitle: string;
  reason: string;
  stopped: string;
  when: string;
  businesses: string;
};

export type FounderNotifTab = 'unread' | 'all';

const KINDS: Array<'all' | FounderNotifKind> = ['all', 'auto', 'support', 'invoice', 'setup'];
const REASONS = ['deranj', 'complaints', 'budget', 'error'] as const;

export function FounderNotificationsView({
  mode = 'desktop',
  rows,
  unreadCount,
  tab,
  onTab,
  kind = 'all',
  onKind,
  onMarkAll,
  onSee,
  detail,
  onCloseDetail,
  onSeeCampaign,
  restartOpen = false,
  onRestart,
  onCancelRestart,
  onConfirmRestart,
  restartBusy = false,
  restartDefaults,
  toast,
  onCloseToast,
  framed = false,
}: {
  mode?: Mode;
  rows: FounderNotifRow[];
  unreadCount: number;
  tab: FounderNotifTab;
  onTab?: (tab: FounderNotifTab) => void;
  kind?: 'all' | FounderNotifKind;
  onKind?: (kind: 'all' | FounderNotifKind) => void;
  onMarkAll?: () => void;
  onSee?: (row: FounderNotifRow) => void;
  /** Drawer-ul deschis (oprirea automată). */
  detail?: FounderAutoStopDetail | null;
  onCloseDetail?: () => void;
  onSeeCampaign?: () => void;
  /** Confirmarea „Repornește” deschisă (peste Drawer). */
  restartOpen?: boolean;
  onRestart?: () => void;
  onCancelRestart?: () => void;
  onConfirmRestart?: (whatChanged: string, watch: boolean) => void | Promise<void>;
  restartBusy?: boolean;
  /** Galeria: textul din preview.html în „Ce ai schimbat”. */
  restartDefaults?: { whatChanged?: string };
  toast?: { title: string; description?: string } | null;
  onCloseToast?: () => void;
  /** Galeria /design: Drawer-ul, confirmarea și Toast-ul în cadru, nu peste fereastră. */
  framed?: boolean;
}) {
  const t = useTranslations('founder.notifications');
  const mob = mode === 'mobile';
  const empty = rows.length === 0;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={mob ? undefined : t('lead')}
        actions={
          mob ? undefined : (
            <Button variant="quiet" icon="check-check" onPress={onMarkAll}>
              {t('markAll')}
            </Button>
          )
        }
        tabs={
          <Tabs
            label={t('title')}
            selectedKey={tab}
            onSelectionChange={(k) => onTab?.(k as FounderNotifTab)}
            items={[
              { id: 'unread', label: t('tab.unread', { n: unreadCount }) },
              { id: 'all', label: t('tab.all') },
            ]}
          />
        }
      />
      <div className={mob ? `${s.body} ${s.bodyMob}` : s.body}>
        <div className={mob ? `${s.tools} ${s.toolsMob}` : s.tools}>
          <div className={s.type}>
            <Select
              size="sm"
              aria-label={t('type')}
              value={kind}
              onChange={(v) => onKind?.(v as 'all' | FounderNotifKind)}
              options={KINDS.map((v) => ({ value: v, label: t(`types.${v}`) }))}
            />
          </div>
        </div>
        <Sheet>
          <SheetSection>
            {empty ? (
              <EmptyState icon="bell" title={t('empty.title')} description={t('empty.body')} />
            ) : (
              <ul className={s.list}>
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={[s.row, mob ? s.rowMob : '', r.unread ? s.unread : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className={s.ic} aria-hidden>
                      <Icon icon={FOUNDER_NOTIF_ICON[r.kind]} size={16} />
                    </span>
                    <div className={s.main}>
                      <span className={s.head}>
                        <span className="body-strong">{r.title}</span>
                        {r.unread && <Badge>{t('new')}</Badge>}
                      </span>
                      <span className="body-small muted">{r.body}</span>
                      <span className="caption muted">{`${t(`types.${r.kind}`)} · ${r.when}`}</span>
                    </div>
                    <Button
                      className={s.see}
                      size="sm"
                      variant="secondary"
                      iconEnd="arrow-right"
                      onPress={() => onSee?.(r)}
                    >
                      {t('see')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SheetSection>
        </Sheet>
      </div>
      {/* S136, planșa 5: confirmarea stă peste pagină; „Renunță” întoarce la Drawer */}
      {detail && !restartOpen && (
        <AutoStopDrawer
          mode={mode}
          detail={detail}
          framed={framed}
          onClose={onCloseDetail}
          onSeeCampaign={onSeeCampaign}
          onRestart={onRestart}
        />
      )}
      {restartOpen && detail && (
        <RestartConfirm
          mode={mode}
          name={detail.name}
          framed={framed}
          busy={restartBusy}
          defaults={restartDefaults}
          onCancel={onCancelRestart}
          onConfirm={onConfirmRestart}
        />
      )}
      {toast && <NotifToast mode={mode} toast={toast} framed={framed} onClose={onCloseToast} />}
    </>
  );
}

/** Toast-ul de după „Repornește” (în galerie, în colțul cadrului). */
export function NotifToast({
  mode,
  toast,
  framed,
  onClose,
}: {
  mode: Mode;
  toast: { title: string; description?: string };
  framed: boolean;
  onClose?: () => void;
}) {
  const ui = useTranslations('ui');
  return (
    <div
      className={[s.toast, mode === 'mobile' ? s.toastMob : '', framed ? '' : s.toastFixed]
        .filter(Boolean)
        .join(' ')}
    >
      <Toast
        tone="done"
        title={toast.title}
        description={toast.description}
        onDismiss={onClose}
        dismissLabel={ui('close')}
      />
    </div>
  );
}

function Line({ children }: { children: ReactNode }) {
  return (
    <p className={`body-small ${s.line}`}>
      <Icon icon="info" size={16} />
      {children}
    </p>
  );
}

export function AutoStopDrawer({
  mode,
  detail,
  framed,
  onClose,
  onSeeCampaign,
  onRestart,
}: {
  mode: Mode;
  detail: FounderAutoStopDetail;
  framed: boolean;
  onClose?: () => void;
  onSeeCampaign?: () => void;
  onRestart?: () => void;
}) {
  const t = useTranslations('founder.notifications');
  const ui = useTranslations('ui');
  const mob = mode === 'mobile';
  const kv: Array<[string, string]> = [
    [t('a.reason'), detail.reason],
    [t('a.stopped'), detail.stopped],
    [t('a.when'), detail.when],
    [t('a.by'), t('a.byV')],
    [t('a.impact'), detail.businesses],
  ];
  return (
    <Drawer
      isOpen
      contained={framed}
      onOpenChange={(o) => !o && onClose?.()}
      onClose={onClose}
      layout={mob ? 'full' : 'auto'}
      width={620}
      title={t('a.title')}
      subtitle={detail.subtitle}
      closeLabel={ui('close')}
      backLabel={ui('back')}
      footer={
        <div className={mob ? `${s.foot} ${s.footMob}` : s.foot}>
          <Button variant="quiet" iconEnd="arrow-right" onPress={onSeeCampaign}>
            {t('a.seeCampaign')}
          </Button>
          <span className={s.grow} />
          <Button variant="secondary" onPress={onClose}>
            {t('close')}
          </Button>
          <Button variant="primary" icon="refresh-cw" onPress={onRestart}>
            {t('a.restart')}
          </Button>
        </div>
      }
    >
      <div className={s.stack}>
        <Notice tone="attention" icon="triangle-alert" title={t('a.what')}>
          {t('a.whatBody')}
        </Notice>
        <dl className={s.kv}>
          {kv.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt className="caption">{k}</dt>
              <dd className="body-small">{v}</dd>
            </div>
          ))}
        </dl>
        <Sheet>
          <SheetSection title={t('a.reasonsTitle')} description={t('a.reasonsLead')}>
            <ul className={s.reasons}>
              {REASONS.map((r) => (
                <li key={r}>
                  <span className="body-strong">{t(`r.${r}`)}</span>
                  <span className="caption muted">{t(`r.${r}Help`)}</span>
                </li>
              ))}
            </ul>
          </SheetSection>
        </Sheet>
        <Line>{t('a.log')}</Line>
      </div>
    </Drawer>
  );
}

export function RestartConfirm({
  mode,
  name,
  framed,
  busy,
  defaults,
  onCancel,
  onConfirm,
}: {
  mode: Mode;
  name: string;
  framed: boolean;
  busy: boolean;
  defaults?: { whatChanged?: string };
  onCancel?: () => void;
  onConfirm?: (whatChanged: string, watch: boolean) => void | Promise<void>;
}) {
  const t = useTranslations('founder.notifications');
  const ui = useTranslations('ui');
  const mob = mode === 'mobile';
  const [changed, setChanged] = useState(defaults?.whatChanged ?? '');
  const [watch, setWatch] = useState(true);
  const [touched, setTouched] = useState(false);
  const missing = changed.trim() === '';
  const dialog = (
    <Dialog
      inline={framed}
      sheet={mob}
      onClose={onCancel}
      title={t('re.title', { name })}
      description={t('re.lead')}
      closeLabel={ui('close')}
      footer={
        <>
          <Button variant="quiet" onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            icon="refresh-cw"
            isPending={busy}
            onPress={() => {
              setTouched(true);
              if (!missing) void onConfirm?.(changed.trim(), watch);
            }}
          >
            {t('re.submit')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        <Notice tone="attention" icon="triangle-alert" title={t('re.warn')}>
          {t('re.warnBody')}
        </Notice>
        <FormField
          label={t('re.changed')}
          required
          hint={t('re.changedHelp')}
          error={touched && missing ? t('re.changedMissing') : undefined}
        >
          <Textarea
            rows={2}
            value={changed}
            onChange={(e) => setChanged(e.target.value)}
            maxLength={2000}
          />
        </FormField>
        <Checkbox description={t('re.watchHelp')} isSelected={watch} onChange={setWatch}>
          {t('re.watch')}
        </Checkbox>
        <Line>{t('re.log')}</Line>
      </div>
    </Dialog>
  );
  return framed ? (
    <div className={mob ? `${s.overlay} ${s.overlayMob}` : s.overlay}>{dialog}</div>
  ) : (
    <DialogTrigger isOpen onOpenChange={(o) => !o && onCancel?.()}>
      {dialog}
    </DialogTrigger>
  );
}
