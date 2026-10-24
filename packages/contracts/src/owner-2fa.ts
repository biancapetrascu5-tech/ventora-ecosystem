/**
 * Starea 2FA a utilizatorului cu rol Owner.
 * Owner-ul poate plăti și schimba accesul celorlalți,
 * deci autentificarea în doi pași este obligatorie pentru el.
 *
 * @see docs/ARCHITECTURE.md §7.1 (P5, D-AUTH-3)
 */
export enum OwnerTwoFactorStatus {
  /**
   * Utilizatorul nu are rol de Owner — 2FA nu este obligatoriu.
   * (Poate fi activat voluntar.)
   */
  NOT_REQUIRED = 'NOT_REQUIRED',

  /**
   * Owner cu 2FA neactivat, în perioada de grație de OWNER_2FA_GRACE_DAYS zile.
   * Acțiunile Owner sunt permise; se afișează un Notice neutru (fără blocare).
   * @see OWNER_2FA_GRACE_DAYS
   */
  GRACE_PERIOD = 'GRACE_PERIOD',

  /**
   * Perioada de grație a expirat.
   * Acțiunile Owner cer 2FA activ înainte de a fi executate.
   */
  REQUIRED = 'REQUIRED',

  /** 2FA activ și configurat. Fără restricții. */
  CONFIGURED = 'CONFIGURED',
}

/**
 * Zile de grație de la primirea rolului Owner până la obligativitatea 2FA.
 * @see docs/ARCHITECTURE.md §7.1 (P5, D-AUTH-3)
 */
export const OWNER_2FA_GRACE_DAYS = 14 as const;

/**
 * Starea 2FA stocată pentru un Owner.
 * Zilele rămase din grație se calculează din graceStartedAt — NU se stochează.
 *
 * @see docs/ARCHITECTURE.md §7.1
 */
export interface OwnerTwoFactorState {
  status: OwnerTwoFactorStatus;
  /**
   * Data de când a început perioada de grație.
   * Prezent doar dacă status === GRACE_PERIOD.
   * Zilele rămase = OWNER_2FA_GRACE_DAYS - (now - graceStartedAt).
   */
  graceStartedAt?: Date;
}
