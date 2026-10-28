import { afterEach, describe, expect, it } from 'vitest';
import {
  invitationLink,
  passwordResetLink,
  renderMemberInvitation,
  renderOwnerInvitation,
  renderOwnerRecovery,
  renderPasswordChanged,
  renderPasswordReset,
} from '../index';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

// Every rendered email: placeholders all filled, the link in both versions, no raw markup
// from the data.
function expectComplete(r: { subject: string; html: string; text: string }) {
  for (const part of [r.subject, r.html, r.text]) expect(part).not.toMatch(/\{\w+\}/);
  expect(r.html.startsWith('<!doctype html><html lang="ro">')).toBe(true);
}

describe('S3 / S54 — one operational layout for every email', () => {
  const expiresAt = new Date('2026-11-04T10:00:00Z');
  const all = [
    renderPasswordReset({ app: 'hub', email: 'a@x.ro', link: 'https://l/1' }),
    renderPasswordReset({ app: 'founder', email: 'a@x.ro', link: 'https://l/2' }),
    renderMemberInvitation({
      email: 'a@x.ro',
      inviterName: 'B',
      businessName: 'Salon Aurora',
      role: 'member',
      expiresAt,
      link: 'https://l/3',
    }),
    renderOwnerInvitation({
      email: 'a@x.ro',
      businessName: 'Salon Aurora',
      expiresAt,
      link: 'https://l/4',
    }),
    renderOwnerRecovery({ email: 'a@x.ro', businessName: 'Salon Aurora', ticketRef: 'T-1' }),
    renderPasswordChanged({ email: 'a@x.ro', trigger: 'reset', changedAt: expiresAt }),
    renderPasswordChanged({ email: 'a@x.ro', trigger: 'change', changedAt: expiresAt }),
  ];

  it('same skeleton: preheader, logo, eyebrow, title, footer with company; light only, 600px', () => {
    // strip the variable text: what remains is the shared structure
    const skeleton = (html: string) =>
      html
        .replace(/<strong[^>]*>|<\/strong>/g, '')
        .replace(/>[^<]*</g, '><')
        .replace(/href="[^"]*"/g, 'href=""')
        .replace(/<p style="[^"]*"><\/p>/g, '')
        .replace(/<p style="[^"]*"><a [^>]*><\/a><\/p>/g, '');
    const first = skeleton(all[0]!.html);
    for (const r of all) {
      expect(skeleton(r.html)).toBe(first);
      expect(r.html).toContain('<meta name="color-scheme" content="light">');
      expect(r.html).toContain('max-width:600px');
      expect(r.html).toContain('display:none;max-height:0'); // preheader
      expect(r.html).toContain('>Ventora</span>'); // logo (wordmark)
      expect(r.html).toContain('text-transform:uppercase'); // eyebrow
      expect(r.html).toMatch(/<h1 [^>]*>[^<]+<\/h1>/); // title
      expect(r.text).toContain('Ventora Systems SRL · Sibiu, România');
    }
  });

  it('the eyebrow names the business when there is one, else the product or the account', () => {
    expect(all[0]!.html).toMatch(/uppercase[^>]*>Ventora<\/p>/);
    expect(all[1]!.html).toMatch(/uppercase[^>]*>Ventora Founder<\/p>/);
    for (const r of all.slice(2, 5)) expect(r.html).toMatch(/uppercase[^>]*>Salon Aurora<\/p>/);
    for (const r of all.slice(5)) expect(r.html).toMatch(/uppercase[^>]*>Contul tău Ventora<\/p>/);
  });

  it('phones: the button takes the full width', () => {
    expect(all[0]!.html).toContain('@media (max-width:480px)');
    expect(all[0]!.html).toContain('.v-btn{display:block!important');
    expect(all[0]!.html).toContain('class="v-btn"');
  });
});

describe('N.3 — links (B-4)', () => {
  it('use the configured base URLs and language-neutral paths', () => {
    process.env.NEXT_PUBLIC_PLATFORM_URL = 'https://app.ventora-hub.com/';
    process.env.NEXT_PUBLIC_FOUNDER_URL = 'https://founder.ventora-hub.com';
    expect(passwordResetLink('hub', 'abc')).toBe(
      'https://app.ventora-hub.com/reset-password?token=abc',
    );
    expect(passwordResetLink('founder', 'abc')).toBe(
      'https://founder.ventora-hub.com/reset-password?token=abc',
    );
    expect(invitationLink('t0k')).toBe('https://app.ventora-hub.com/invite/t0k');
  });
});

describe('N.3 — password reset (E-1, E-2)', () => {
  it('Hub, with name (T-1)', () => {
    const link = 'https://app.ventora-hub.com/reset-password?token=abc';
    const r = renderPasswordReset({ app: 'hub', email: 'ana@x.ro', name: 'Ana', link });
    expectComplete(r);
    expect(r.subject).toBe('Alege o parolă nouă pentru contul Ventora');
    expect(r.text).toContain('Bună, Ana,');
    expect(r.text).toContain(`Alege o parolă nouă: ${link}`);
    expect(r.html).toContain(`href="${link}"`);
    expect(r.text).toContain('te deconectăm de pe toate dispozitivele'); // T-2
    expect(r.text).toContain(
      'Ai primit acest e-mail pentru că adresa ana@x.ro e folosită pentru un cont Ventora.',
    );
  });

  it('Hub, without a real name → plain greeting', () => {
    for (const name of [null, '', '  ', 'ana@x.ro']) {
      const r = renderPasswordReset({ app: 'hub', email: 'ana@x.ro', name, link: 'https://l' });
      expect(r.text).toContain('\n\nBună,\n\n');
      expect(r.text).not.toContain('Bună, ');
    }
  });

  it('Founder: support address (T-3) and the calmer warning (T-4)', () => {
    const r = renderPasswordReset({
      app: 'founder',
      email: 'f@ventora.ro',
      name: 'Bianca',
      link: 'https://f/reset-password?token=1',
    });
    expectComplete(r);
    expect(r.subject).toBe('Resetarea parolei pentru Ventora Founder');
    expect(r.text).toContain(
      'Dacă nu ai cerut tu resetarea, scrie imediat la support@ventorasystems.com. Poate fi o încercare de acces la contul tău.',
    );
  });

  it('escapes HTML coming from data', () => {
    const r = renderPasswordReset({
      app: 'hub',
      email: 'a@x.ro',
      name: '<script>x</script>',
      link: 'https://l?a=1&b=2',
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).toContain('href="https://l?a=1&amp;b=2"');
  });
});

describe('R-PR7 — password changed (S78, approved copy)', () => {
  const changedAt = new Date('2026-10-28T12:05:00Z'); // 14:05 in Bucharest (EET)

  it('after a reset: signed out on all devices', () => {
    const r = renderPasswordChanged({ email: 'ana@x.ro', trigger: 'reset', changedAt });
    expectComplete(r);
    expect(r.subject).toBe('Parola contului tău Ventora a fost schimbată');
    expect(r.html).toContain(
      '>Schimbarea s-a făcut pe 28 octombrie 2026, la 14:05 EET. Dacă nu ai fost tu, citește e-mailul.</div>',
    );
    expect(r.html).toMatch(/uppercase[^>]*>Contul tău Ventora<\/p>/);
    expect(r.html).toMatch(/<h1 [^>]*>Parola contului tău a fost schimbată<\/h1>/);
    expect(r.text).toContain(
      'Parola contului ana@x.ro a fost schimbată pe 28 octombrie 2026, la 14:05 EET. Te-am scos din cont pe toate dispozitivele.',
    );
    expect(r.text).not.toContain('celelalte dispozitive');
    expect(r.text).toContain('Dacă ai fost tu, nu trebuie să faci nimic.');
    expect(r.text).toContain(
      'Nu ai fost tu? Alege imediat o parolă nouă din „Ai uitat parola?” și scrie-ne la support@ventorasystems.com.',
    );
    expect(r.text).toContain(
      'Primești acest e-mail pentru că parola contului tău Ventora s-a schimbat. E un e-mail de securitate: îl trimitem la fiecare schimbare de parolă și nu se poate opri.',
    );
    expect(r.text).not.toContain('Bună,');
  });

  it('from the account settings: signed out on the other devices', () => {
    const r = renderPasswordChanged({ email: 'ana@x.ro', trigger: 'change', changedAt });
    expectComplete(r);
    expect(r.text).toContain(
      'Parola contului ana@x.ro a fost schimbată pe 28 octombrie 2026, la 14:05 EET. Te-am scos din cont pe celelalte dispozitive.',
    );
    expect(r.text).not.toContain('toate dispozitivele');
  });

  it('summer time shows EEST', () => {
    const r = renderPasswordChanged({
      email: 'ana@x.ro',
      trigger: 'reset',
      changedAt: new Date('2026-07-01T07:32:00Z'),
    });
    expect(r.text).toContain('pe 1 iulie 2026, la 10:32 EEST.');
  });

  it('the button writes to support; in the text the address is not a link', () => {
    const r = renderPasswordChanged({ email: 'ana@x.ro', trigger: 'reset', changedAt });
    expect(r.html).toContain('class="v-btn" href="mailto:support@ventorasystems.com"');
    expect(r.html).toMatch(/>Scrie-ne la suport<\/a>/);
    expect(r.text).toContain('Scrie-ne la suport: mailto:support@ventorasystems.com');
    expect(r.html.match(/<a /g)).toHaveLength(1); // no link to "Ai uitat parola?"
    expect(r.html).not.toContain('forgot');
    expect(r.html).not.toContain('reset-password');
  });
});

describe('N.3 — invitations (E-3, E-3b, E-4)', () => {
  const expiresAt = new Date('2026-11-04T10:00:00Z');

  it('member invitation with role (T-5) and the approved wording (T-6)', () => {
    const r = renderMemberInvitation({
      email: 'ion@x.ro',
      inviterName: 'Bianca Petrașcu',
      businessName: 'Salon Aurora',
      role: 'admin',
      expiresAt,
      link: 'https://app/invite/t',
    });
    expectComplete(r);
    expect(r.subject).toBe('Bianca Petrașcu te-a invitat în Salon Aurora pe Ventora');
    expect(r.text).toContain(
      'Bianca Petrașcu te-a invitat în echipa Salon Aurora pe Ventora, ca administrator.',
    );
    expect(r.text).toContain('Invitația e valabilă 7 zile, până pe 4 noiembrie 2026.');
    expect(r.text).toContain('Nu te așteptai la această invitație?');
    expect(r.text).not.toContain('Ăsta e un link nou');
    expect(r.text).toContain('cineva a invitat adresa ion@x.ro în Ventora');
  });

  it('resent invitation adds the new-link line', () => {
    const r = renderMemberInvitation({
      email: 'ion@x.ro',
      inviterName: 'Ana',
      businessName: 'B',
      role: 'member',
      expiresAt,
      link: 'https://app/invite/t2',
      resent: true,
    });
    expect(r.text).toContain('Ăsta e un link nou. Cel primit înainte nu mai funcționează.');
    expect(r.text).toContain('ca membru.');
  });

  it('owner invitation: no grace period (T-9), reply to this email (T-8)', () => {
    const r = renderOwnerInvitation({
      email: 'owner@x.ro',
      businessName: 'Salon Aurora',
      expiresAt,
      link: 'https://app/invite/o',
    });
    expectComplete(r);
    expect(r.subject).toBe('Salon Aurora e gata pe Ventora');
    expect(r.text).toContain('Intră în Salon Aurora: https://app/invite/o');
    // S55: the owner's invitation from Founder lasts 30 days
    expect(r.text).toContain('Linkul e valabil 30 de zile, până pe 4 noiembrie 2026.');
    expect(r.text).toContain(
      'La prima intrare îți alegi parola și pornești autentificarea în doi pași, ca afacerea ta să fie protejată de la început.',
    );
    expect(r.text).toContain('Răspunde la acest e-mail și te ajutăm.');
    expect(r.text).not.toMatch(/14 zile/);
  });
});

describe('REC.1 — owner recovery (E-5)', () => {
  const base = {
    email: 'owner@x.ro',
    name: 'Ana',
    businessName: 'Salon Aurora',
    ticketRef: 'SUP-1042',
  };

  it('variant B contains the reset link', () => {
    const r = renderOwnerRecovery({
      ...base,
      passwordResetLink: 'https://app/reset-password?token=z',
    });
    expectComplete(r);
    expect(r.subject).toBe('Autentificarea în doi pași a contului tău a fost resetată');
    expect(r.text).toContain('La cererea ta (SUP-1042)'); // T-10
    expect(r.text).toContain('Am resetat și parola.');
    expect(r.text).toContain('Alege o parolă nouă: https://app/reset-password?token=z');
    expect(r.text).toContain('cu o aplicație de autentificare'); // T-12
    expect(r.text).toContain('coduri de rezervă'); // R-2F3
    expect(r.text).toContain('Verificăm imediat ce s-a întâmplat.'); // T-11
  });

  it('variant A has no reset link', () => {
    const r = renderOwnerRecovery(base);
    expectComplete(r);
    expect(r.text).not.toContain('Am resetat și parola.');
    expect(r.html).not.toContain('reset-password');
  });

  it('no email text says "coduri de recuperare"', () => {
    const all = [
      renderOwnerRecovery(base),
      renderPasswordReset({ app: 'hub', email: 'a@x.ro', link: 'https://l' }),
      renderPasswordReset({ app: 'founder', email: 'a@x.ro', link: 'https://l' }),
    ];
    for (const r of all) expect(r.text).not.toContain('coduri de recuperare');
  });
});
