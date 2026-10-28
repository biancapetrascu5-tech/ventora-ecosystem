import ro from '@ventora/i18n/messages/ro.json';
import en from '@ventora/i18n/messages/en.json';
import fr from '@ventora/i18n/messages/fr.json';
import es from '@ventora/i18n/messages/es.json';
import de from '@ventora/i18n/messages/de.json';
import it from '@ventora/i18n/messages/it.json';
import { CANONICAL_LOCALE, type Locale } from '@ventora/i18n';

// Email texts live in the shared catalogs (ARCHITECTURE: emails use the same catalogs as the UI),
// under the `email` key. Placeholders are plain `{name}`; i18n:check keeps the 6 files in sync.
export interface EmailMessages {
  common: {
    greeting: string;
    greetingNoName: string;
    signature: string;
    footerAccount: string;
    footerInvitation: string;
    company: string;
  };
  roles: Record<'owner' | 'admin' | 'member' | 'external_collaborator', string>;
  passwordReset: Record<
    'hub' | 'founder',
    { subject: string; intro: string; button: string; validity: string; notRequested: string }
  >;
  // R-PR7 (S78): approved copy, the same for Hub and Founder.
  passwordChanged: {
    subject: string;
    pre: string;
    eyebrow: string;
    title: string;
    leadReset: string;
    leadAccount: string;
    ifYou: string;
    notYou: string;
    cta: string;
    why: string;
  };
  invitation: {
    member: {
      subject: string;
      intro: string;
      button: string;
      resentNotice: string;
      validity: string;
      existingAccount: string;
      notExpected: string;
    };
    owner: {
      subject: string;
      intro: string;
      button: string;
      validity: string;
      firstLogin: string;
      questions: string;
    };
  };
  ownerRecovery: {
    subject: string;
    intro: string;
    passwordReset: string;
    button: string;
    nextSteps: string;
    notRequested: string;
  };
  supportSession: {
    subject: string;
    intro: string;
    reason: string;
    scope: string;
    until: string;
    close: string;
    notRequested: string;
    footer: string;
  };
}

type Catalog = { email?: EmailMessages };
const CATALOGS = { ro, en, fr, es, de, it } as unknown as Record<Locale, Catalog>;

/** Email texts for a locale; falls back to the canonical (RO) catalog. */
export function emailMessages(locale: Locale): EmailMessages {
  const messages = CATALOGS[locale]?.email ?? CATALOGS[CANONICAL_LOCALE].email;
  if (!messages) throw new Error('[notifications] email messages missing from the RO catalog');
  return messages;
}

/** `{name}` placeholders. A missing value is a programming error, not an empty string. */
export function fill(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`[notifications] missing value for {${key}}`);
    return value;
  });
}
