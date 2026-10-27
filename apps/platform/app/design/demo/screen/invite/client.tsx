/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useState } from 'react';
import {
  AppIcon,
  BrandZone,
  Button,
  Checkbox,
  FormField,
  Icon,
  Input,
  type AppName,
} from '@ventora/ui';

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

function Chevrons() {
  return (
    <svg
      viewBox="0 0 176 240"
      aria-hidden
      style={{
        fill: 'none',
        stroke: 'var(--line-strong)',
        strokeWidth: 1.5,
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 176,
        height: 240,
        opacity: 0.4,
      }}
    >
      {[40, 72, 104].map((y) => (
        <polyline key={y} points={`32,${y} 88,${y + 80} 144,${y}`} />
      ))}
      <polyline points="48,168 88,224 128,168" />
    </svg>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--canvas)',
    color: 'var(--ink)',
  },
  split: { flex: 1, display: 'flex', minHeight: '100vh' },
  brand: {
    width: '46%',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--space-8) var(--space-10)',
    position: 'relative',
    overflow: 'hidden',
    gap: 'var(--space-4)',
  },
  brandTop: { display: 'flex', alignItems: 'center' },
  statement: { marginTop: 'auto', paddingBottom: 'var(--space-6)' },
  foot: { marginTop: 'auto', color: 'var(--on-brand-muted)' },
  formSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--canvas)',
    color: 'var(--ink)',
  },
  authTop: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: 'var(--space-4) var(--space-6)',
  },
  langBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--line)',
    background: 'transparent',
    color: 'var(--ink-secondary)',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 13,
  },
  formMain: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 'var(--space-8) var(--space-4)',
  },
  card: {
    width: 440,
    background: 'var(--sheet)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-8)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    boxSizing: 'border-box' as const,
  },
  invHead: { display: 'flex', gap: 'var(--space-3)', alignItems: 'center' },
  invMark: {
    width: 48,
    height: 48,
    borderRadius: 'var(--radius-md)',
    background: 'var(--neutral-soft)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: 'var(--ink)',
    flexShrink: 0,
    boxShadow: 'inset 0 0 0 1px var(--line-strong)',
    fontSize: 14,
  },
  invRole: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--sunken)',
    borderRadius: 'var(--radius-sm)',
  },
  invApps: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap' as const,
    marginTop: 'var(--space-1)',
  },
  invApp: {
    display: 'inline-flex',
    gap: 'var(--space-1)',
    alignItems: 'center',
    color: 'var(--ink-secondary)',
  },
  invEmail: { display: 'flex', flexDirection: 'column', gap: 2 },
  passWrap: { position: 'relative' as const },
  passToggle: {
    position: 'absolute' as const,
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--ink-secondary)',
    display: 'flex',
    alignItems: 'center',
    padding: 4,
  },
  reqs: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },
  req: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center', color: 'var(--ink-muted)' },
  reqOk: { color: 'var(--done-ink)' },
  blockBtn: { width: '100%' },
  expiredNotice: {
    display: 'flex',
    gap: 'var(--space-2)',
    alignItems: 'flex-start',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--attention-soft)',
    color: 'var(--attention-ink)',
    border: '1px solid var(--attention-line)',
  },
};

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
    <div style={s.root} data-theme={theme}>
      <div style={s.split}>
        <BrandZone as="aside" style={s.brand}>
          <div style={s.brandTop}>
            <VentoraLogoFull height={28} />
          </div>
          <p className="display-xl" style={s.statement}>
            Afacerea ta.
            <br />
            Într-un singur loc.
          </p>
          <p className="caption" style={s.foot}>
            © 2026 Ventora Systems
          </p>
          <Chevrons />
        </BrandZone>

        <div style={s.formSide}>
          <header style={s.authTop}>
            <button type="button" style={s.langBtn}>
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
              Română <Icon icon="chevron-down" size="sm" aria-hidden />
            </button>
          </header>
          <main style={s.formMain}>
            <div style={s.card}>
              {state === 'expired' ? (
                <>
                  <div style={s.invHead}>
                    <span style={s.invMark as React.CSSProperties}>SA</span>
                    <div>
                      <p className="caption muted">Invitație de la Bianca Petrașcu</p>
                      <h1 className="display-m">Invitație expirată</h1>
                    </div>
                  </div>
                  <div style={s.expiredNotice} role="alert">
                    <Icon icon="clock" size="sm" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <p className="body-strong">Această invitație nu mai este valabilă</p>
                      <p className="body-small">
                        Invitațiile expiră după 7 zile. Cere proprietarului să trimită una nouă.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'grid' }}>
                    <Button variant="primary" size="lg">
                      Cere o invitație nouă
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div style={s.invHead}>
                    <span style={s.invMark as React.CSSProperties}>SA</span>
                    <div>
                      <p className="caption muted">Invitație de la Bianca Petrașcu</p>
                      <h1 className="display-m">Intră în echipa Salon Aurora</h1>
                    </div>
                  </div>
                  <div style={s.invRole}>
                    <p className="body">
                      Rolul tău: <strong className="body-strong">Recepție</strong>. Vei avea acces
                      la:
                    </p>
                    <div style={s.invApps}>
                      {(['booking', 'crm', 'shifts'] as AppName[]).map((a) => (
                        <span key={a} style={s.invApp}>
                          <AppIcon app={a} size={24} />
                          <span className="body-small">{APP_LABELS[a]}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <FormField label="Nume complet">
                    <Input type="text" autoComplete="name" defaultValue="Ioana Pavel" />
                  </FormField>
                  <div style={s.invEmail}>
                    <span className="caption muted">E-mail</span>
                    <span className="body-strong">ioana.pavel@salonaurora.ro</span>
                    <span className="caption muted">Pe această adresă ai primit invitația.</span>
                  </div>
                  <FormField label="Parolă nouă">
                    <div style={s.passWrap}>
                      <Input
                        type={showPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={pass}
                        onChange={(e) => setPass(e.target.value)}
                      />
                      <button
                        type="button"
                        style={s.passToggle}
                        onClick={() => setShowPass((v) => !v)}
                        aria-label={showPass ? 'Ascunde parola' : 'Arată parola'}
                      >
                        <Icon icon={showPass ? 'eye-off' : 'eye'} size="sm" aria-hidden />
                      </button>
                    </div>
                  </FormField>
                  <ul style={s.reqs}>
                    {[
                      { ok: pass.length >= 10, text: 'Cel puțin 10 caractere' },
                      { ok: /\d/.test(pass), text: 'Cel puțin o cifră' },
                      { ok: /[A-Z]/.test(pass), text: 'Cel puțin o literă mare' },
                    ].map(({ ok, text }) => (
                      <li key={text} style={ok ? { ...s.req, ...s.reqOk } : s.req}>
                        <Icon icon={ok ? 'circle-check' : 'circle'} size="sm" />
                        <span className="body-small">{text}</span>
                      </li>
                    ))}
                  </ul>
                  <Checkbox defaultSelected>
                    Accept Termenii și Politica de confidențialitate
                  </Checkbox>
                  <div style={{ display: 'grid' }}>
                    <Button variant="primary" size="lg">
                      Acceptă invitația
                    </Button>
                  </div>
                  <p className="caption muted" style={{ textAlign: 'center' }}>
                    Invitația e valabilă până pe 31 octombrie 2026.
                  </p>
                  <p className="caption muted" style={{ textAlign: 'center' }}>
                    Le poți citi oricând din Setări.
                  </p>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
