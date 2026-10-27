/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useState } from 'react';
import { AppIcon, BrandZone, Button, Checkbox, Icon, Input, type AppName } from '@ventora/ui';
import styles from '../screen.module.css';

const APP_LABELS: Partial<Record<AppName, string>> = {
  booking: 'Booking',
  crm: 'CRM',
  shifts: 'Shifts',
};

function VentoraLogoFull({ height = 28 }: { height?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 6 250 68"
      role="img"
      aria-label="Ventora"
      height={height}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <svg x="8" y="10" width="60" height="60" viewBox="0 0 400 400" overflow="visible">
        <polygon points="200,150 352,262 200,330 48,262" fill="#161e38" />
        <polygon points="126,96 196,132 192,344 158,230" fill="#f2ede3" />
        <polygon points="274,96 204,132 208,344 242,230" fill="#f2ede3" />
        <polygon
          points="28,16 120,80 188,352 200,392"
          fill="#FFAA75"
          stroke="#0a1024"
          strokeWidth="6"
        />
        <polygon
          points="372,16 280,80 212,352 200,392"
          fill="#B1744F"
          stroke="#0a1024"
          strokeWidth="6"
        />
        <polygon points="200,172 200,362 162,246" fill="#FFAA75" stroke="#0a1024" strokeWidth="7" />
        <polygon points="200,172 238,246 200,362" fill="#B1744F" stroke="#0a1024" strokeWidth="7" />
      </svg>
      <path
        fill="#FFAA75"
        d="M90.960 47L85.695 47L77.622 28.100L83.400 28.100L88.530 40.412L93.768 28.100L99.060 28.100L90.960 47"
      />
      <path
        fill="var(--ink)"
        d="M118.986 47L103.812 47L103.812 28.100L118.635 28.100L118.635 32.231L109.104 32.231L109.104 35.417L117.501 35.417L117.501 39.413L109.104 39.413L109.104 42.869L118.986 42.869L118.986 47M130.434 47L125.196 47L125.196 28.100L129.597 28.100L137.940 38.171L137.940 28.100L143.178 28.100L143.178 47L138.777 47L130.434 36.929L130.434 47M159.567 47L154.221 47L154.221 32.339L148.416 32.339L148.416 28.100L165.345 28.100L165.345 32.339L159.567 32.339L159.567 47M180.114 47.378Q177.846 47.378 175.929 46.649Q174.012 45.920 172.595 44.584Q171.177 43.247 170.394 41.465Q169.611 39.683 169.611 37.550Q169.611 35.417 170.394 33.635Q171.177 31.853 172.595 30.517Q174.012 29.180 175.929 28.451Q177.846 27.722 180.114 27.722Q182.409 27.722 184.313 28.451Q186.216 29.180 187.620 30.517Q189.024 31.853 189.821 33.635Q190.617 35.417 190.617 37.550Q190.617 39.683 189.821 41.478Q189.024 43.274 187.620 44.597Q186.216 45.920 184.313 46.649Q182.409 47.378 180.114 47.378M180.114 42.950Q181.194 42.950 182.126 42.572Q183.057 42.194 183.746 41.478Q184.434 40.763 184.826 39.764Q185.217 38.765 185.217 37.550Q185.217 36.308 184.826 35.322Q184.434 34.337 183.746 33.621Q183.057 32.906 182.126 32.528Q181.194 32.150 180.114 32.150Q179.034 32.150 178.103 32.528Q177.171 32.906 176.483 33.621Q175.794 34.337 175.403 35.322Q175.011 36.308 175.011 37.550Q175.011 38.765 175.403 39.764Q175.794 40.763 176.483 41.478Q177.171 42.194 178.103 42.572Q179.034 42.950 180.114 42.950M202.011 47L196.665 47L196.665 28.100L205.116 28.100Q209.247 28.100 211.475 29.977Q213.702 31.853 213.702 35.093Q213.702 37.226 212.676 38.765Q211.704 40.250 210.003 41.060L214.080 47L208.356 47L204.927 41.978L202.011 41.978L202.011 47M202.011 32.312L202.011 37.847L204.981 37.847Q206.655 37.847 207.479 37.118Q208.302 36.389 208.302 35.093Q208.302 33.770 207.479 33.041Q206.655 32.312 204.981 32.312L202.011 32.312M223.071 47L217.617 47L225.960 28.100L231.225 28.100L239.595 47L234.033 47L232.548 43.328L224.556 43.328L223.071 47M226.122 39.386L230.982 39.386L228.552 33.338"
      />
    </svg>
  );
}

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
    <div
      data-theme={theme}
      style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)' }}
    >
      <div className={styles.authSplit}>
        {/* Brand panel */}
        <BrandZone as="aside" className={styles.authBrand}>
          <div className={styles.authBrandTop}>
            <VentoraLogoFull height={28} />
            <button
              type="button"
              className={`${styles.langBtn} ${styles.authLangMobile}`}
              aria-label="Schimbă limba"
            >
              <GlobeSVG />
              Română
              <Icon icon="chevron-down" size="sm" aria-hidden />
            </button>
          </div>
          <p className="display-xl" style={{ marginTop: 'auto', paddingBottom: 'var(--space-6)' }}>
            Afacerea ta.
            <br />
            Într-un singur loc.
          </p>
          <p className="caption" style={{ color: 'var(--on-brand-muted)' }}>
            © 2026 Ventora Systems
          </p>
          <svg
            className={styles.authChev}
            viewBox="0 0 176 240"
            aria-hidden
            style={{ fill: 'none', stroke: 'var(--line-strong)', strokeWidth: 1.5 }}
          >
            {[40, 72, 104].map((y) => (
              <polyline key={y} points={`32,${y} 88,${y + 80} 144,${y}`} />
            ))}
            <polyline points="48,168 88,224 128,168" />
          </svg>
        </BrandZone>

        {/* Form side */}
        <div className={styles.authFormSide}>
          <header className={styles.authFormHeader}>
            <button type="button" className={styles.langBtn}>
              <GlobeSVG />
              Română
              <Icon icon="chevron-down" size="sm" aria-hidden />
            </button>
          </header>
          <main className={styles.authFormMain}>
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
                      Rolul tău: <strong className="body-strong">Recepție</strong>. Vei avea acces
                      la:
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <span className="body-small">
                      Nume complet
                      <span className={styles.required} aria-hidden>
                        *
                      </span>
                    </span>
                    <Input type="text" autoComplete="name" defaultValue="Ioana Pavel" />
                  </div>
                  <div className={styles.invEmail}>
                    <span className="caption muted">E-mail</span>
                    <span className="body-strong">ioana.pavel@salonaurora.ro</span>
                    <span className="caption muted">Pe această adresă ai primit invitația.</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <span className="body-small">
                      Parolă nouă
                      <span className={styles.required} aria-hidden>
                        *
                      </span>
                    </span>
                    <div className={styles.passWrap}>
                      <Input
                        type={showPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={pass}
                        onChange={(e) => setPass(e.target.value)}
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
                  <Checkbox defaultSelected>
                    Accept Termenii și Politica de confidențialitate
                  </Checkbox>
                  <p className={styles.checkboxSub}>Le poți citi oricând din Setări.</p>
                  <div className={styles.blockBtn}>
                    <Button variant="primary" size="lg">
                      Acceptă invitația
                    </Button>
                  </div>
                </>
              )}
            </div>
          </main>
          <footer className={styles.authFooter}>Termeni · Confidențialitate · Ajutor</footer>
        </div>
      </div>
    </div>
  );
}
