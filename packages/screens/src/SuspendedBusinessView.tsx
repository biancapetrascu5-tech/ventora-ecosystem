'use client';

import { useTranslations } from 'next-intl';
import { Avatar, Button, Logo, StatusPill, cn } from '@ventora/ui';
import { SupportNote } from './ChooseBusinessView';
import styles from './choose.module.css';
import auth from './auth.module.css';
import s from './suspended.module.css';

/* HubBusinessSuspended (S112): singura afacere a persoanei e suspendată. Ecranul ține locul
   alegerii afacerii: fără motivul suspendării, neutru (persoana nu are ce repara), doar adresa de
   suport ca link, „Scrie-ne la suport” și „Ieși din cont”. */

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

export function SuspendedBusinessView({
  userName,
  business,
  supportEmail,
  onSignOut,
  mob,
}: {
  userName: string;
  business: string;
  supportEmail: string;
  onSignOut?: () => void;
  mob?: boolean;
}) {
  const t = useTranslations('hub');
  return (
    <div className={cn(styles.page, mob && styles.mobile, mob && s.mobile)}>
      <header className={styles.top}>
        <Logo size={36} />
        <Avatar name={userName} size="sm" />
      </header>
      <main className={styles.main}>
        <div className={s.sus}>
          <div className={s.mark}>
            <span className={auth.mark}>{initials(business)}</span>
            <StatusPill tone="neutral" icon="lock">
              {t('chooseBusiness.accessStopped')}
            </StatusPill>
          </div>
          <h1 className="display-l">{t('suspended.title', { business })}</h1>
          <SupportNote text={t('suspended.body', { email: '\u0000' })} email={supportEmail} />
          <div className={s.actions}>
            <Button
              variant="secondary"
              icon="mail"
              block={mob}
              onPress={() => {
                window.location.href = `mailto:${supportEmail}`;
              }}
            >
              {t('suspended.contact')}
            </Button>
            <Button variant="quiet" icon="log-out" block={mob} onPress={onSignOut}>
              {t('suspended.signOut')}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
