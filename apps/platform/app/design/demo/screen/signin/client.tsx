/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useState } from 'react';
import { AuthLayout, Button, Checkbox, FormField, Icon, Input } from '@ventora/ui';
import { AuthStatement } from '../AuthStatement';
import styles from '../screen.module.css';

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

export function SigninScreenClient({
  theme,
  state,
}: {
  theme: 'light' | 'dark';
  state: 'default' | 'error';
}) {
  const [email, setEmail] = useState('bianca@salonaurora.ro');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <AuthLayout
      theme={theme}
      languageSelector={<LangBtn />}
      statement={<AuthStatement />}
      footer="Termeni · Confidențialitate · Ajutor"
    >
      <div className={styles.authForm}>
        <div className={styles.authHead}>
          <h1 className="display-hub">Bine ai revenit</h1>
          <p className="body muted">Intră în contul tău Ventora.</p>
        </div>
        {state === 'error' && (
          <div
            role="alert"
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'flex-start',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--danger-soft)',
              color: 'var(--danger-ink)',
              border: '1px solid var(--danger-line)',
            }}
          >
            <Icon icon="error" size="sm" style={{ marginTop: 2, flexShrink: 0 }} />
            <p className="body-small">E-mail sau parolă greșite. Verifică și încearcă din nou.</p>
          </div>
        )}
        <FormField label="E-mail">
          <Input
            type="email"
            autoComplete="username"
            iconStart="mail"
            placeholder="bianca@salonaurora.ro"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            isInvalid={state === 'error'}
          />
        </FormField>
        <div className={styles.passwordRow}>
          <div className={styles.passwordLabel}>
            <span className="body-small">Parolă</span>
            <a href="#" className={`body-small ${styles.forgotLink}`}>
              Ai uitat parola?
            </a>
          </div>
          <div className={styles.passWrap}>
            <Input
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              isInvalid={state === 'error'}
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
        </div>
        <Checkbox isSelected={rememberMe} onChange={setRememberMe}>
          Ține-mă minte pe acest dispozitiv timp de 30 de zile
        </Checkbox>
        <div className={styles.blockBtn}>
          <Button variant="primary" size="lg">
            Intră în cont
          </Button>
        </div>
        <div className={styles.authNote}>
          <Icon icon="mail" size="sm" style={{ marginTop: 2, flexShrink: 0 }} />
          <p className="body-small">
            Nu ai cont? Conturile se fac doar prin invitație. Dacă ai primit una, deschide linkul
            din e-mail și îți alegi parola.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
