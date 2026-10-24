/**
 * Preferințele comerciale ale utilizatorului.
 *
 * Emailul comercial este BLOCAT implicit, până la:
 * 1. validarea juridică (D-GRW-8, NECESITA DECIZIE)
 * 2. obținerea consimțământului explicit al utilizatorului
 *
 * @see docs/GROWTH_ENGINE.md §0.5, docs/ARCHITECTURE.md §8.7 (D-GRW-8)
 */
export interface CommercialPreferences {
  /** Notificări comerciale in-app: active implicit */
  inAppEnabled: boolean;
  /**
   * Email comercial: BLOCAT implicit.
   * Nu se activează fără decizia D-GRW-8 și consimțământ explicit.
   */
  emailEnabled: boolean;
}

/**
 * Valorile implicite la crearea unui utilizator sau la schimbarea rolului.
 * @see docs/ARCHITECTURE.md §8.7 (D-GRW-8)
 */
export const DEFAULT_COMMERCIAL_PREFERENCES: CommercialPreferences = {
  inAppEnabled: true,
  emailEnabled: false,
} as const;
