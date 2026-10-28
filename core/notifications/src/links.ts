// Links in transactional emails (decision B-4: language-neutral paths). The base URLs are
// required in production (@ventora/config), so a real email never points at localhost.
const DEFAULT_PLATFORM_URL = 'http://localhost:3100';
const DEFAULT_FOUNDER_URL = 'http://localhost:3102';

export type AuthApp = 'hub' | 'founder';

function baseUrl(app: AuthApp): string {
  const raw =
    app === 'founder'
      ? process.env.NEXT_PUBLIC_FOUNDER_URL || DEFAULT_FOUNDER_URL
      : process.env.NEXT_PUBLIC_PLATFORM_URL || DEFAULT_PLATFORM_URL;
  return raw.replace(/\/+$/, '');
}

export function passwordResetLink(app: AuthApp, token: string): string {
  return `${baseUrl(app)}/reset-password?token=${encodeURIComponent(token)}`;
}

export function invitationLink(token: string): string {
  return `${baseUrl('hub')}/invite/${encodeURIComponent(token)}`;
}
