'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, Notice } from '@ventora/ui';
import styles from './launcher.module.css';

/* HubEmpty · S146 „Cere acces” (lotul 5.1c): foaia de sub bandă când persoana n-are nicio aplicație.
   Stările din preview.html (EmptyBody146):
     idle      → „Cere acces” + „Scrie-ne”;
     sending   → „Se trimite cererea…”, butonul oprit;
     sent      → „Cerere trimisă · {data}”, oprit; sub el „O poți trimite din nou după {data}”;
     resend    → au trecut 7 zile: textul o spune, „Trimite din nou” activ, „Ultima cerere: {data}”;
     error     → Notice danger „Cererea nu a plecat”, „Încearcă din nou”;
     suspended → Notice danger cu adresa de suport, „Cere acces” oprit.
   Sub foaie: „Între timp, alege-ți fotografia și limba din Contul tău.” */

import type { AccessRequestState } from './access-request-state';

export type { AccessRequestState };

export interface HubEmptyBodyProps {
  state: AccessRequestState;
  /** Owner-ul care alege aplicațiile; null: textul fără nume (fără „Cere acces”). */
  owner: string | null;
  business: string;
  supportEmail: string;
  /** „25 oct.” — data ultimei cereri (sent / resend). */
  sentOn?: string;
  /** „1 nov.” — de când se poate trimite din nou (sent). */
  resendOn?: string;
  onAsk: () => void;
}

export function HubEmptyBody({
  state,
  owner,
  business,
  supportEmail,
  sentOn,
  resendOn,
  onAsk,
}: HubEmptyBodyProps) {
  const t = useTranslations('hub.empty');
  const legacy = useTranslations('hub.launcher.empty');
  const account = useTranslations('account');
  const router = useRouter();

  if (!owner) {
    // owner / admin fără nicio aplicație în abonament: nu are cui cere
    return (
      <div className={styles.empty}>
        <EmptyState icon="layout-grid" title={t('title')} description={legacy('bodyNoOwner')} />
      </div>
    );
  }

  // „… din {account}.” — linkul spre Contul tău în mijlocul frazei, în orice limbă
  const [before, after = ''] = String(t.raw('meanwhile')).split('{account}');
  const description =
    state === 'sent'
      ? t('sentDesc', { owner })
      : state === 'resend'
        ? t('resendReady')
        : t('desc', { owner });

  const main =
    state === 'sent' ? (
      <Button variant="primary" icon="check" isDisabled>
        {t('sent', { date: sentOn ?? '' })}
      </Button>
    ) : state === 'sending' ? (
      <Button variant="primary" icon="send" isDisabled>
        {t('sending')}
      </Button>
    ) : state === 'resend' ? (
      <Button variant="primary" icon="send" onPress={onAsk}>
        {t('resend')}
      </Button>
    ) : state === 'error' ? (
      <Button variant="primary" icon="refresh-cw" onPress={onAsk}>
        {t('retry')}
      </Button>
    ) : (
      <Button variant="primary" icon="send" isDisabled={state === 'suspended'} onPress={onAsk}>
        {t('ask')}
      </Button>
    );

  return (
    <>
      <div className={styles.empty}>
        {state === 'error' && (
          <div className={styles.emptyNotice}>
            <Notice tone="danger" icon="circle-alert" title={t('error.title')}>
              {t('error.body')}
            </Notice>
          </div>
        )}
        {state === 'suspended' && (
          <div className={styles.emptyNotice}>
            <Notice tone="danger" icon="lock">
              {t('error.suspended', { business, email: supportEmail })}
            </Notice>
          </div>
        )}
        <EmptyState
          icon="layout-grid"
          title={t('title')}
          description={description}
          actions={
            <>
              {main}
              <Button variant="quiet" onPress={() => router.push('/support/new')}>
                {t('write')}
              </Button>
            </>
          }
        />
        {state === 'sent' && resendOn && (
          <p className={`body-small muted ${styles.emptyNote}`}>
            {t('resendOn', { date: resendOn })}
          </p>
        )}
        {state === 'resend' && sentOn && (
          <p className={`body-small muted ${styles.emptyNote}`}>
            {t('lastSent', { date: sentOn })}
          </p>
        )}
      </div>
      <p className={`body-small muted ${styles.meanwhile}`}>
        {before}
        <Link className="v-link" href="/account">
          {account('title')}
        </Link>
        {after}
      </p>
    </>
  );
}
