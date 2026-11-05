'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  AppIcon,
  APPS,
  Button,
  Dialog,
  FormField,
  Icon,
  Notice,
  Sheet,
  SheetSection,
  StatusPill,
  Textarea,
  type AppName,
} from '@ventora/ui';
import s from './lifecycle.module.css';

/* Lotul 3.8 (S121) în Hub · Abonament și consum: HubBillingProfile (datele de facturare, doar
   citire, „Cere o schimbare”; membrul vede un rând) și HubSetupRequest (cererea cu implementare,
   pas cu pas, cu data de la care curge abonamentul). 6 limbi: `billing.profile.*`, `billing.setup.*`. */

export type HubProfile = {
  type: 'company' | 'person';
  name: string;
  taxId: string | null;
  regCom: string | null;
  /** „Str. Nicolae Bălcescu 12, Sibiu, jud. Sibiu, România” */
  address: string;
  email: string;
};

/** „Date de facturare”: doar citire; owner-ul cere o schimbare (o solicitare la Suport). */
export function HubBillingProfileCard({
  profile,
  pendingSince,
  ownerOnly,
  onChange,
}: {
  profile: HubProfile | null;
  /** „4 noiembrie”: o cerere de schimbare trimisă, încă nesalvată de echipă. */
  pendingSince?: string | null;
  /** Membrul / adminul: un rând, fără date. */
  ownerOnly?: boolean;
  onChange?: () => void;
}) {
  const t = useTranslations('billing.profile');
  const b = useTranslations('billing');
  if (ownerOnly) {
    return (
      <Notice tone="neutral" icon="lock">
        {t('ownerOnly')}
      </Notice>
    );
  }
  const rows: Array<[string, ReactNode]> = [];
  if (profile) {
    rows.push([
      t('issuedTo'),
      <span key="n">
        <span className="body-strong">{profile.name}</span> ·{' '}
        {profile.type === 'company' ? t('company') : t('person')}
      </span>,
    ]);
    if (profile.type === 'company') {
      if (profile.taxId) rows.push([t('cui'), profile.taxId]);
      if (profile.regCom) rows.push([t('regCom'), profile.regCom]);
    }
    rows.push([t('address'), profile.address], [t('email'), profile.email]);
  }
  return (
    <Sheet>
      <SheetSection
        title={t('title')}
        actions={
          onChange ? (
            <Button size="sm" icon="pencil" onPress={onChange}>
              {t('change')}
            </Button>
          ) : undefined
        }
      >
        <div className={s.stack}>
          {pendingSince ? (
            <Notice tone="neutral" icon="clock">
              {t('pending', { date: pendingSince })}
            </Notice>
          ) : null}
          {rows.length ? (
            <dl className={s.kv}>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt className="caption">{k}</dt>
                  <dd className="body">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="caption muted">{t('changeHelp')}</p>
          <p className="caption muted">
            {b('issuer')} {b('vatNote')}
          </p>
        </div>
      </SheetSection>
    </Sheet>
  );
}

/** „Ce vrei să schimbi în datele de facturare?” */
export function ProfileChangeDialog({
  value,
  onChange,
  empty,
  pending,
  failed,
  mob,
  inline,
  closeLabel,
  onCancel,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  empty?: boolean;
  pending?: boolean;
  failed?: boolean;
  mob?: boolean;
  inline?: boolean;
  closeLabel: string;
  onCancel: () => void;
  onSend: () => void;
}) {
  const t = useTranslations('billing.profile');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      title={t('changeTitle')}
      description={t('changeHelp')}
      closeLabel={closeLabel}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('changeCancel')}
          </Button>
          <Button variant="primary" icon="send" isPending={pending} onPress={onSend}>
            {t('changeSend')}
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        {failed ? <Notice tone="danger">{t('changeFailed')}</Notice> : null}
        <FormField
          label={t('changeLabel')}
          isRequired
          hint={empty ? undefined : t('changeHint')}
          error={empty ? t('changeEmpty') : undefined}
        >
          <Textarea
            rows={4}
            maxLength={2000}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}

export type HubSetupState =
  | 'requested'
  | 'offer'
  | 'accepted'
  | 'confirmed'
  | 'paid'
  | 'inProgress'
  | 'live'
  | 'cancelled'
  | 'refunded';

const HS = {
  requested: ['neutral', 'clock'],
  offer: ['attention', 'file-text'],
  accepted: ['neutral', 'check'],
  confirmed: ['attention', 'wallet'],
  paid: ['neutral', 'check'],
  inProgress: ['neutral', 'wrench'],
  live: ['done', 'check-check'],
  cancelled: ['neutral', 'x'],
  refunded: ['neutral', 'rotate-ccw'],
} as const;

const FLOW = ['requested', 'accepted', 'confirmed', 'paid', 'inProgress', 'live'] as const;

function Steps({ state }: { state: HubSetupState }) {
  const t = useTranslations('billing.setup');
  const at = state === 'offer' ? 0 : FLOW.indexOf(state as (typeof FLOW)[number]);
  return (
    <ol className={s.suSteps}>
      {FLOW.map((f, i) => {
        const done = i < at || (state === 'live' && i === at);
        const cur = i === at && state !== 'live';
        return (
          <li key={f} className={done ? s.done : cur ? s.cur : undefined}>
            <Icon icon={done ? 'circle-check' : cur ? 'circle-dot' : 'circle'} size={16} />
            <span className="body-small">{t(`st.${f}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** „Implementarea {app}”: ce se întâmplă acum, pașii; peach doar când e rândul owner-ului. */
export function HubSetupRequestCard({
  app,
  state,
  body,
  pending,
  onAccept,
  onDecline,
  onPay,
  payAmount,
  onOpen,
}: {
  app: AppName | string;
  state: HubSetupState;
  /** Textul pasului, gata formatat (sumele, datele, motivul). */
  body: string;
  pending?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onPay?: () => void;
  payAmount?: string;
  onOpen?: () => void;
}) {
  const t = useTranslations('billing.setup');
  const name = APPS[app as AppName]?.name ?? app;
  const closed = state === 'cancelled' || state === 'refunded';
  return (
    <Sheet>
      <SheetSection title={t('title', { app: name })}>
        <div className={s.stack}>
          <div className={s.row}>
            <AppIcon app={app as AppName} size={32} />
            <StatusPill tone={HS[state][0]} icon={HS[state][1]}>
              {t(`st.${state}`)}
            </StatusPill>
          </div>
          <p className="body">{body}</p>
          {state === 'offer' ? (
            <div className={s.row}>
              <Button variant="primary" icon="check" isPending={pending} onPress={onAccept}>
                {t('accept')}
              </Button>
              <Button variant="quiet" isDisabled={pending} onPress={onDecline}>
                {t('decline')}
              </Button>
            </div>
          ) : state === 'confirmed' && onPay ? (
            <div className={s.row}>
              <Button variant="primary" icon="lock" isPending={pending} onPress={onPay}>
                {t('pay', { amount: payAmount ?? '' })}
              </Button>
            </div>
          ) : state === 'live' && onOpen ? (
            <div className={s.row}>
              <Button variant="secondary" icon="arrow-right" onPress={onOpen}>
                {t('open', { app: name })}
              </Button>
            </div>
          ) : null}
          {closed ? null : (
            <>
              <p className="subheading">{t('steps')}</p>
              <Steps state={state} />
            </>
          )}
          {state === 'live' || closed ? null : (
            <p className={`${s.line} body-small`}>
              <Icon icon="info" size={16} />
              {t('subNote')}
            </p>
          )}
        </div>
      </SheetSection>
    </Sheet>
  );
}
