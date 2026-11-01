'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Dialog,
  FormField,
  IconButton,
  Input,
  Menu,
  PageHeader,
  StatusPill,
  type IconName,
} from '@ventora/ui';
import { useIsPhone } from '../screens/hooks';
import type { BusinessStatus } from './BusinessesView';
import styles from './business.module.css';

/* FounderBusiness (Lot 2.8, doar română, S57): antetul afacerii (starea, clientă din, proprietarul),
   „Mai multe” (sesiunea de suport și recuperarea proprietarului, S95; suspendarea și reactivarea,
   D3-20 a), fișa proprietarului și ultimele modificări. Partea comercială (consumul, excepțiile,
   fișa abonamentului, „Adaugă o excepție”, filele) vine din Lotul 3.4: aici sunt doar locurile ei,
   umplute în galeria /design cu exemplele din design. S112 (FounderBusinessActions): pe telefon
   antetul păstrează aceeași pereche ca pe desktop — acțiunea principală și „Mai multe acțiuni” —
   sub titlu; o afacere suspendată are nota ei sub antet. */

export type BusinessMenuItem = {
  id: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  /** Linie de despărțire înaintea elementului. */
  separatorBefore?: boolean;
};

export type BusinessChange = { id: string | number; date: string; text: string };

export function BusinessView({
  name,
  status,
  meta,
  primaryAction,
  menu,
  onMenuAction,
  tabs,
  main,
  plan,
  owner,
  recent,
  notice,
  full,
  phone: phoneProp,
}: {
  name: string;
  /** Lipsă în filele care nu au starea în antet (FounderDiscounts: „Plăți și facturi”). */
  status?: BusinessStatus;
  /** „client din martie 2025 · Andrei Mureșan (proprietar)” */
  meta: string;
  /** „Adaugă o excepție” (3.4). */
  primaryAction?: ReactNode;
  /** Gol: fără „Mai multe acțiuni” (ca în preview-ul FounderDiscounts). */
  menu: BusinessMenuItem[];
  onMenuAction: (id: string) => void;
  /** Prezentare · Consum · Excepții · Facturi · Jurnal (3.4). */
  tabs?: ReactNode;
  /** Consumul și excepțiile (3.4). */
  main?: ReactNode;
  /** Fișa „Abonament” (3.4). */
  plan?: ReactNode;
  owner: ReactNode;
  recent: BusinessChange[];
  /** S112: „Suspendată pe {date} de {name}. …” sub antet. */
  notice?: ReactNode;
  /** Lotul 3.4: o filă pe toată lățimea, fără fișele din dreapta („Plăți și facturi”, „Jurnal”). */
  full?: ReactNode;
  /** Forța aspectul de telefon (galeria: cadrul de 1280 rămâne desktop). */
  phone?: boolean;
}) {
  const t = useTranslations('founder.business');
  const nav = useTranslations('founder.nav');
  const viewportPhone = useIsPhone();
  const phone = phoneProp ?? viewportPhone;

  const cards = (
    <>
      {plan && <div className={styles.card}>{plan}</div>}
      <div className={styles.card}>
        <p className="subheading">{t('ownerCard')}</p>
        {owner}
      </div>
      <div className={styles.card}>
        <p className="subheading">{t('recentCard')}</p>
        <ul className={`body-small ${styles.hist}`}>
          {recent.map((c) => (
            <li key={c.id}>
              <span className="muted">{c.date}</span> {c.text}
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={
          phone ? undefined : [{ label: nav('businesses'), href: '/businesses' }, { label: name }]
        }
        meta={
          status ? (
            <span className={styles.meta}>
              <StatusPill tone={status.tone} icon={status.icon}>
                {status.label}
              </StatusPill>
              <span className="body-small muted">{meta}</span>
            </span>
          ) : (
            <span className="body-small muted">{meta}</span>
          )
        }
        actions={
          !primaryAction && menu.length === 0 ? undefined : (
            <span
              className={phone ? `${styles.acts} ${styles.actsMob}` : styles.acts}
              data-actions-full={phone ? '' : undefined}
            >
              {primaryAction}
              {menu.length > 0 && (
                <Menu
                  label={t('moreActions')}
                  items={menu.flatMap((m) => [
                    ...(m.separatorBefore ? [{ separator: true as const }] : []),
                    { id: m.id, label: m.label, icon: m.icon, isDanger: m.danger },
                  ])}
                  onAction={onMenuAction}
                >
                  <IconButton
                    icon="ellipsis-vertical"
                    label={t('moreActions')}
                    variant="secondary"
                  />
                </Menu>
              )}
            </span>
          )
        }
        tabs={tabs}
      />
      <div className={styles.axb}>
        {notice}
        {full ? (
          full
        ) : main ? (
          <div className={styles.split}>
            <div className={styles.main}>{main}</div>
            <aside className={styles.side}>{cards}</aside>
          </div>
        ) : (
          <div className={styles.solo}>{cards}</div>
        )}
      </div>
    </>
  );
}

/**
 * „Reactivează afacerea” (FounderBusinessActions, S112): confirmarea — ce se întâmplă (membrii
 * se pot conecta din nou, cu rolurile și accesul pe care le aveau) și cine a suspendat-o, când.
 */
export function ReactivateBusinessDialog({
  name,
  people,
  suspendedOn,
  suspendedBy,
  pending,
  inline,
  mob,
  onCancel,
  onConfirm,
}: {
  name: string;
  people: number;
  /** „29 oct.” */
  suspendedOn?: string;
  suspendedBy?: string | null;
  pending?: boolean;
  inline?: boolean;
  mob?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.business.reactivateDialog');
  const ui = useTranslations('ui');
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      icon="rotate-ccw"
      title={t('title', { business: name })}
      description={
        !suspendedOn
          ? undefined
          : suspendedBy
            ? t('what', { date: suspendedOn, name: suspendedBy })
            : t('whatNoName', { date: suspendedOn })
      }
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="quiet" isDisabled={pending} onPress={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="primary" icon="rotate-ccw" isPending={pending} onPress={onConfirm}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <p className="body">{t('body', { count: people })}</p>
    </Dialog>
  );
}

/** „Suspendarea unei afaceri · confirmare cu numele” (FounderStates). */
export function SuspendBusinessDialog({
  name,
  people,
  value,
  onValueChange,
  pending,
  inline,
  mob,
  onCancel,
  onConfirm,
}: {
  name: string;
  people: number;
  value: string;
  onValueChange: (v: string) => void;
  pending?: boolean;
  inline?: boolean;
  mob?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('founder.business.suspendDialog');
  const ui = useTranslations('ui');
  const matches = value.trim() === name.trim();
  return (
    <Dialog
      inline={inline}
      sheet={mob}
      tone="danger"
      title={t('title', { name })}
      closeLabel={ui('close')}
      onClose={onCancel}
      footer={
        <>
          <Button onPress={onCancel}>{t('keep')}</Button>
          <Button variant="danger" isDisabled={!matches} isPending={pending} onPress={onConfirm}>
            {t('confirm')}
          </Button>
        </>
      }
    >
      <p className="body">{t('body', { count: people })}</p>
      <FormField label={t('confirmLabel')} isRequired>
        <Input placeholder={name} value={value} onChange={(e) => onValueChange(e.target.value)} />
      </FormField>
    </Dialog>
  );
}
