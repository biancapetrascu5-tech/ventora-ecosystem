'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { MIN_PASSWORD, type AuthBrand } from '../parts';

/* Ce diferă între Hub și Founder în ecranele de autentificare. Aplicația îl dă o singură dată,
   în layout-ul rutelor de autentificare; containerele din pachet îl citesc de aici. */
export type AuthRoutes = {
  signIn: string;
  forgotPassword: string;
  twoFactor: string;
  twoFactorSetup: string;
  /** „Generează coduri noi” din toastul R-2F10. */
  backupCodes: string;
};

export type AuthAppConfig = {
  brand: AuthBrand;
  routes: AuthRoutes;
  /** După parolă (și cod): unde ajunge utilizatorul (acțiune de server a aplicației). */
  afterSignIn: () => Promise<string>;
  /** Limba paginii și schimbarea ei (doar Hub). */
  locale?: string;
  onLocaleChange?: (code: string) => void;
  /** Câte coduri de rezervă au rămas (acțiune de server). */
  readBackupCodesLeft?: () => Promise<number | null>;
  /** Textul cerinței de lungime, când nu e cel din auth.reset.req.length (Founder: 12). */
  lengthLabel?: string;
};

const HUB_ROUTES: AuthRoutes = {
  signIn: '/sign-in',
  forgotPassword: '/forgot-password',
  twoFactor: '/two-factor',
  twoFactorSetup: '/two-factor/setup',
  backupCodes: '/account',
};

const Ctx = createContext<AuthAppConfig>({
  brand: 'hub',
  routes: HUB_ROUTES,
  afterSignIn: async () => '/',
});

export function AuthAppProvider({
  config,
  children,
}: {
  config: Omit<AuthAppConfig, 'routes'> & { routes?: Partial<AuthRoutes> };
  children: ReactNode;
}) {
  return (
    <Ctx.Provider value={{ ...config, routes: { ...HUB_ROUTES, ...config.routes } }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuthApp(): AuthAppConfig & { minPassword: number } {
  const c = useContext(Ctx);
  return { ...c, minPassword: MIN_PASSWORD[c.brand] };
}
