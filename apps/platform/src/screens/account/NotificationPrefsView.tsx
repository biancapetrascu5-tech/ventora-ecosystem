'use client';

import { useTranslations } from 'next-intl';
import { Icon, Notice, SheetSection, Toggle, cn } from '@ventora/ui';
import styles from './notification-prefs.module.css';

/* Contul tău · Notificări (Lot 4.4, S114b, D4-6, D4-7): NotifPrefs din HubAccount/preview.html.
   În aplicație, operaționalele sunt mereu pornite (coloana „Mereu”, fără comutator); pe e-mail,
   un comutator pe fiecare subiect; securitatea „Nu se pot opri”; fără coloana SMS. „Recomandări
   Ventora” (în aplicație; e-mail „Disponibil în curând”, D-GRW-8) și „Noutăți de la Ventora”
   (e-mail oprit până îl pornește persoana) stau separat. Pe telefon, aceeași logică, ca listă. */

export const PREF_EMAIL_TOPICS = [
  'bookings',
  'phone',
  'billing',
  'limits',
  'leave',
  'support',
] as const;
export type PrefEmailTopic = (typeof PREF_EMAIL_TOPICS)[number];
const SECURITY = ['password', 'twoFactor', 'supportSession'] as const;

export interface NotificationPrefsValue {
  email: Record<PrefEmailTopic, boolean>;
  recommendations: { inApp: boolean };
  news: { inApp: boolean; email: boolean };
}

export type PrefChange =
  | { topic: PrefEmailTopic; channel: 'email' }
  | { topic: 'recommendations'; channel: 'in_app' }
  | { topic: 'news'; channel: 'in_app' | 'email' };

function Always() {
  const t = useTranslations('notifications.prefs');
  return (
    <span className={cn(styles.fixed, 'body-small')}>
      <Icon icon="check" size={14} />
      {t('always')}
    </span>
  );
}

function Locked() {
  const t = useTranslations('notifications.prefs');
  return (
    <span className={cn(styles.fixed, 'body-small')}>
      <Icon icon="lock" size={14} />
      {t('locked')}
    </span>
  );
}

export function NotificationPrefs({
  value,
  onChange,
  mob,
}: {
  value: NotificationPrefsValue;
  onChange?: (change: PrefChange, enabled: boolean) => void;
  mob?: boolean;
}) {
  const t = useTranslations('notifications.prefs');
  const lp = mob ? 'start' : 'end';
  const set = (change: PrefChange) => (enabled: boolean) => onChange?.(change, enabled);

  const work = mob ? (
    <div className={styles.list}>
      <p className={cn('caption muted', styles.grp)}>{t('group.work')}</p>
      {PREF_EMAIL_TOPICS.map((c) => (
        <div key={c} className={styles.item}>
          <div className={styles.itemText}>
            <span className="body">{t(`cat.${c}`)}</span>
            <span className="caption muted">{t('alwaysInApp')}</span>
          </div>
          <Toggle
            isSelected={value.email[c]}
            onChange={set({ topic: c, channel: 'email' })}
            labelPosition="start"
          >
            {t('emailToggle')}
          </Toggle>
        </div>
      ))}
      <p className={cn('caption muted', styles.grp)}>{t('group.security')}</p>
      <p className="body-small muted">{t('securityNote')}</p>
      {SECURITY.map((c) => (
        <div key={c} className={styles.item}>
          <span className="body">{t(`cat.${c}`)}</span>
          <Locked />
        </div>
      ))}
    </div>
  ) : (
    <div className={styles.table} role="table">
      <div className={cn(styles.row, styles.head, 'caption')} role="row">
        <span role="columnheader">{t('group.work')}</span>
        <span role="columnheader">{t('col.inApp')}</span>
        <span role="columnheader">{t('col.email')}</span>
      </div>
      {PREF_EMAIL_TOPICS.map((c) => (
        <div key={c} className={styles.row} role="row">
          <span className="body">{t(`cat.${c}`)}</span>
          <Always />
          <span>
            <Toggle
              aria-label={`${t(`cat.${c}`)} — ${t('col.email')}`}
              isSelected={value.email[c]}
              onChange={set({ topic: c, channel: 'email' })}
            />
          </span>
        </div>
      ))}
      <div className={cn(styles.row, styles.head, 'caption')} role="row">
        <span role="columnheader">{t('group.security')}</span>
        <span />
        <span />
      </div>
      {SECURITY.map((c) => (
        <div key={c} className={styles.row} role="row">
          <span className="body">{t(`cat.${c}`)}</span>
          <Always />
          <Locked />
        </div>
      ))}
      <p className={cn('body-small muted', styles.note)}>{t('securityNote')}</p>
    </div>
  );

  return (
    <>
      <SheetSection title={t('title')} description={t('lead')}>
        {work}
      </SheetSection>
      <SheetSection title={t('reco.title')} description={t('reco.desc')}>
        <div className={styles.d0}>
          <Toggle
            description={t('reco.inAppDesc')}
            isSelected={value.recommendations.inApp}
            onChange={set({ topic: 'recommendations', channel: 'in_app' })}
            labelPosition={lp}
          >
            {t('news.inApp')}
          </Toggle>
          <Toggle description={t('reco.soon')} isDisabled labelPosition={lp}>
            {t('news.email')}
          </Toggle>
          <Notice tone="neutral" icon="info">
            {t('reco.note')}
          </Notice>
        </div>
      </SheetSection>
      <SheetSection title={t('news.title')} description={t('news.desc')}>
        <div className={styles.d0}>
          <Toggle
            isSelected={value.news.inApp}
            onChange={set({ topic: 'news', channel: 'in_app' })}
            labelPosition={lp}
          >
            {t('news.inApp')}
          </Toggle>
          <Toggle
            description={t('news.emailDesc')}
            isSelected={value.news.email}
            onChange={set({ topic: 'news', channel: 'email' })}
            labelPosition={lp}
          >
            {t('news.email')}
          </Toggle>
        </div>
      </SheetSection>
    </>
  );
}
