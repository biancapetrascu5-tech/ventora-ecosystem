/**
 * Tipuri pentru pregătirile Growth Engine din Faza 0.
 * Implementarea v1 are loc în Faza 5 (Hub).
 * @see docs/GROWTH_ENGINE.md, docs/ARCHITECTURE.md §8.7
 */

/**
 * Tipul unui slot de afișare pentru recomandări Growth Engine.
 * Aplicațiile declară sloturi în manifest.ts; Growth Engine decide ce apare.
 * @see docs/GROWTH_ENGINE.md §2.2
 */
export type GrowthPlacementKind = 'card' | 'upgrade' | 'banner' | 'tooltip';

export interface GrowthPlacement {
  /** ID unic al slotului, format: `<app>.<context>.<position>` */
  id: string;
  kind: GrowthPlacementKind;
  /**
   * Slotul se află într-un flux critic (formulare, plăți, erori, HR sensibil).
   * Sloturile critice NU se folosesc pentru Growth Engine.
   * @see docs/GROWTH_ENGINE.md §2.2
   */
  critical: boolean;
  /**
   * Slotul e declanșat de acțiunea explicită a utilizatorului (ex. a apăsat pe o funcție blocată).
   * Aceste sloturi sunt EXCEPTATE de la plafoanele de frecvență.
   * @see docs/GROWTH_ENGINE.md §2.5, docs/ARCHITECTURE.md §8.7 (D-GRW-6)
   */
  userInitiated?: boolean;
}

/**
 * Semnal comercial pe care o aplicație îl poate emite.
 * Doar evenimentele marcate growthSafe: true din catalogul de evenimente.
 * @see docs/GROWTH_ENGINE.md §2.3
 */
export interface GrowthSignalDeclaration {
  /** Tipul evenimentului din catalogul de evenimente, format: `<app>.<entity>.<action>.v<n>` */
  eventType: string;
  /**
   * Semnalul este marcat growthSafe: payload fără date sensibile.
   * Niciodată: date ale clienților finali, sume, angajați, documente.
   * @see docs/GROWTH_ENGINE.md §2.3, docs/ARCHITECTURE.md §8.7
   */
  growthSafe: true;
}

/**
 * Plafoanele Growth Engine pe utilizator.
 * Founder le poate ajusta în limitele permise de GROWTH_QUOTA_BOUNDS.
 * @see docs/GROWTH_ENGINE.md §2.5, docs/ARCHITECTURE.md §8.7 (D-GRW-6, D-GRW-16, P25)
 */
export interface GrowthQuotaConfig {
  /** Recomandări proactive per zi per utilizator (implicit: 1) */
  dailyPerUser: number;
  /** Recomandări proactive per săptămână per utilizator (implicit: 3) */
  weeklyPerUser: number;
  /**
   * Zile de cooldown după respingerea aceleiași oferte (implicit: 30).
   * Valoarea minimă permisă e definită în GROWTH_QUOTA_BOUNDS.
   */
  dismissCooldownDays: number;
}

/**
 * Valorile implicite pentru plafoanele Growth Engine.
 * @see docs/ARCHITECTURE.md §8.7 (D-GRW-6)
 */
export const DEFAULT_GROWTH_QUOTAS: GrowthQuotaConfig = {
  dailyPerUser: 1,
  weeklyPerUser: 3,
  dismissCooldownDays: 30,
} as const;

/**
 * Limitele care restricționează ce poate seta Founder.
 * Validate pe server — UI-ul nu le poate ocoli.
 * @see docs/ARCHITECTURE.md §8.7 (D-GRW-16, P25)
 */
export const GROWTH_QUOTA_BOUNDS = {
  daily: { default: 1, max: 2 },
  weekly: { default: 3, max: 5 },
  /**
   * dismissCooldownDays are un MINIM permis (nu maxim).
   * Founder nu poate seta mai puțin de 14 zile.
   */
  dismissCooldownDays: { default: 30, min: 14 },
} as const;
