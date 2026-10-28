/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useState } from 'react';
import {
  AppIcon,
  AuthLayout,
  Button,
  Checkbox,
  FormField,
  Icon,
  Input,
  type AppName,
} from '@ventora/ui';
import { AuthStatement } from '../AuthStatement';
import styles from '../screen.module.css';

const APP_LABELS: Partial<Record<AppName, string>> = {
  booking: 'Booking',
  crm: 'CRM',
  shifts: 'Shifts',
};

function GlobeSVG() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LangBtn() {
  return (
    <button type="button" className={styles.langBtn} aria-label="Schimbă limba">
      <GlobeSVG />
      Română
      <Icon icon="chevron-down" size="sm" aria-hidden />
    </button>
  );
}

export function InviteScreenClient({
  theme,
  state,
}: {
  theme: 'light' | 'dark';
  state: 'default' | 'expired';
}) {
  const [showPass, setShowPass] = useState(false);
  const [pass, setPass] = useState('aurora2026');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <AuthLayout theme={theme} languageSelector={<LangBtn />} statement={<AuthStatement />}>
      <div className={styles.authForm} style={{ width: 440, maxWidth: '100%' }}>
        {state === 'expired' ? (
          <>
            <div className={styles.invHead}>
              <span className={styles.invMark}>SA</span>
              <div>
                <p className="caption muted">Invitație de la Bianca Petrașcu</p>
                <h1 className="display-m">Invitație expirată</h1>
              </div>
            </div>
            <div className={styles.expiredNotice} role="alert">
              <Icon icon="clock" size="sm" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <p className="body-strong">Această invitație nu mai este valabilă</p>
                <p className="body-small">
                  Invitațiile expiră după 7 zile. Cere proprietarului să trimită una nouă.
                </p>
              </div>
            </div>
            <div className={styles.blockBtn}>
              <Button variant="primary" size="lg">
                Cere o invitație nouă
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.invHead}>
              <span className={styles.invMark}>SA</span>
              <div>
                <p className="caption muted">Invitație de la Bianca Petrașcu</p>
                <h1 className="display-m">Intră în echipa Salon Aurora</h1>
              </div>
            </div>
            <div className={styles.invRole}>
              <p className="body">
                Rolul tău: <strong className="body-strong">Recepție</strong>. Vei avea acces la:
              </p>
              <div className={styles.invApps}>
                {(['booking', 'crm', 'shifts'] as AppName[]).map((a) => (
                  <span key={a} className={styles.invApp}>
                    <AppIcon app={a} size={24} />
                    <span className="body-small">{APP_LABELS[a]}</span>
                  </span>
                ))}
              </div>
            </div>
            <FormField label="Nume complet" isRequired>
              {({ id, 'aria-required': ar }) => (
                <Input
                  id={id}
                  type="text"
                  autoComplete="name"
                  defaultValue="Ioana Pavel"
                  aria-required={ar}
                />
              )}
            </FormField>
            <div className={styles.invEmail}>
              <span className="caption muted">E-mail</span>
              <span className="body-strong">ioana.pavel@salonaurora.ro</span>
              <span className="caption muted">Pe această adresă ai primit invitația.</span>
            </div>
            <FormField label="Parolă nouă" isRequired>
              {({ id, 'aria-required': ar }) => (
                <div className={styles.passWrap}>
                  <Input
                    id={id}
                    type={showPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    aria-required={ar}
                  />
                  <button
                    type="button"
                    className={styles.passToggle}
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Ascunde parola' : 'Arată parola'}
                  >
                    <Icon icon={showPass ? 'eye-off' : 'eye'} size="sm" aria-hidden />
                  </button>
                </div>
              )}
            </FormField>
            <ul className={styles.invReqs}>
              {[
                { ok: pass.length >= 10, text: 'Cel puțin 10 caractere' },
                { ok: /\d/.test(pass), text: 'Cel puțin o cifră' },
                { ok: /[A-Z]/.test(pass), text: 'Cel puțin o literă mare' },
              ].map(({ ok, text }) => (
                <li
                  key={text}
                  className={ok ? `${styles.invReq} ${styles.invReqOk}` : styles.invReq}
                >
                  <Icon icon={ok ? 'circle-check' : 'circle'} size="sm" />
                  <span className="body-small">{text}</span>
                </li>
              ))}
            </ul>
            <Checkbox defaultSelected>Accept Termenii și Politica de confidențialitate</Checkbox>
            <p className={styles.checkboxSub}>Le poți citi oricând din Setări.</p>
            <div className={styles.blockBtn}>
              <Button variant="primary" size="lg">
                Acceptă invitația
              </Button>
            </div>
            <p className="caption muted" style={{ textAlign: 'center' }}>
              Invitația e valabilă până pe <strong>31 octombrie 2026</strong>.
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
