'use client';

import { useTranslations } from 'next-intl';
import { Avatar, Badge, Checkbox, Icon, Input, Logo, StatusPill, cn } from '@ventora/ui';
import styles from './choose.module.css';
import auth from './auth.module.css';

/**
 * S112: a sentence with the support address as a link in place of `{email}` — the caller
 * translates with a marker (U+0000) so the link is split out without rebuilding the sentence.
 */
export function SupportNote({
  text,
  email,
  className = 'body muted',
}: {
  text: string;
  email: string;
  className?: string;
}) {
  const [before, after = ''] = text.split('\u0000');
  return (
    <p className={className}>
      {before}
      <a className={styles.link} href={`mailto:${email}`}>
        {email}
      </a>
      {after}
    </p>
  );
}

/* HubChooseBusiness: pentru cine lucrează în mai multe afaceri. Ultima folosită stă prima și are
   focus; peste 6 afaceri apare căutarea. Fără „Adaugă afacere”. */

export type BusinessRow = {
  id: string;
  name: string;
  /** Numele rolului, deja tradus (rol de sistem sau personalizat). */
  role: string;
  /** Câte aplicații are membrul; lipsește pentru owner și admin (au toate aplicațiile). */
  apps?: number;
  /** Când a fost deschisă ultima dată, deja formatat („acum 2 ore”); lipsește dacă niciodată. */
  last?: string;
  recent?: boolean;
  /** S112: afacerea e suspendată — „Acces oprit”, lacăt, nu se deschide. */
  suspended?: boolean;
};

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

export function ChooseBusinessView({
  userName,
  businesses,
  query,
  onQueryChange,
  remember,
  onRememberChange,
  onOpen,
  focusFirst,
  mob,
  supportEmail,
}: {
  userName: string;
  businesses: BusinessRow[];
  query?: string;
  onQueryChange?: (v: string) => void;
  remember: boolean;
  onRememberChange?: (v: boolean) => void;
  onOpen?: (id: string) => void;
  /** Prima afacere (ultima folosită) primește focusul: Enter o deschide. */
  focusFirst?: boolean;
  mob?: boolean;
  /** S112: adresa de suport din nota de sub listă, când o afacere are „Acces oprit”. */
  supportEmail?: string;
}) {
  const t = useTranslations('hub.chooseBusiness');
  const many = businesses.length > 6;
  const q = (query ?? '').trim().toLowerCase();
  const shown = q ? businesses.filter((b) => b.name.toLowerCase().includes(q)) : businesses;
  return (
    <div className={cn(styles.page, mob && styles.mobile)}>
      <header className={styles.top}>
        <Logo size={36} />
        <Avatar name={userName} size="sm" />
      </header>
      <main className={styles.main}>
        <div className={styles.choose}>
          <h1 className="display-l">{t('title')}</h1>
          <p className="body muted">{t('lead', { count: businesses.length })}</p>
          {many && (
            <Input
              icon="search"
              placeholder={t('search')}
              aria-label={t('search')}
              value={query}
              onChange={(e) => onQueryChange?.(e.target.value)}
            />
          )}
          <div className={styles.list}>
            {shown.map((b, i) => {
              if (b.suspended) {
                const stopped = t('accessStopped');
                return (
                  <div
                    key={b.id}
                    className={cn(styles.biz, styles.isOff)}
                    role="group"
                    aria-disabled="true"
                    aria-label={`${b.name}, ${stopped}`}
                  >
                    <span className={cn(auth.mark, auth.markSm)}>{initials(b.name)}</span>
                    <span className={styles.text}>
                      <span className="body-strong">{b.name}</span>
                      <span className="body-small muted">{b.role}</span>
                    </span>
                    <StatusPill tone="neutral" icon="lock">
                      {stopped}
                    </StatusPill>
                  </div>
                );
              }
              const meta = [
                b.role,
                b.apps !== undefined ? t('apps', { count: b.apps }) : null,
                b.last ? t('opened', { when: b.last }) : null,
              ].filter(Boolean);
              return (
                <button
                  key={b.id}
                  type="button"
                  className={styles.biz}
                  aria-label={[b.name, ...meta].join(', ')}
                  autoFocus={focusFirst && i === 0 && !many}
                  onClick={() => onOpen?.(b.id)}
                >
                  <span className={cn(auth.mark, auth.markSm)}>{initials(b.name)}</span>
                  <span className={styles.text}>
                    <span className="body-strong">{b.name}</span>
                    <span className="body-small muted">{meta.join(' · ')}</span>
                  </span>
                  {b.recent && <Badge>{t('lastUsed')}</Badge>}
                  <Icon icon="chevron-right" size={16} className="muted" />
                </button>
              );
            })}
          </div>
          {supportEmail && businesses.some((b) => b.suspended) && (
            <SupportNote text={t('stoppedNote', { email: '\u0000' })} email={supportEmail} />
          )}
          <Checkbox isSelected={remember} onChange={onRememberChange}>
            {t('remember')}
          </Checkbox>
          <p className="body-small muted">{t('missing')}</p>
        </div>
      </main>
    </div>
  );
}
