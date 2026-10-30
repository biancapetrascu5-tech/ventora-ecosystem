/**
 * Plicul standard al unui eveniment în ecosistem.
 * @see docs/ARCHITECTURE.md §11.2
 */
export interface EventEnvelope<TPayload = unknown> {
  /**
   * UUIDv7 — generat în aplicație, ordonat cronologic.
   * @see docs/ARCHITECTURE.md §6.5
   */
  eventId: string;
  /**
   * Format: `<entitate>.<acțiune>` (catalogul din event-catalog.ts), versiunea separat în `version`.
   * Exemplu: `invitation.new_link_requested`, versiunea 1.
   */
  type: string;
  version: number;
  occurredAt: Date;
  /** ID-ul organizației căreia îi aparține evenimentul */
  organizationId: string;
  /** Aplicația care a emis evenimentul */
  sourceApp: string;
  /** ID-ul resursei principale implicate */
  resourceId: string;
  /** Permite urmărirea unui flux de operații (opțional) */
  correlationId?: string;
  /**
   * Evenimentul poate fi trimis ca semnal Growth Engine.
   * Doar dacă payload-ul NU conține date sensibile
   * (clienți finali, sume, angajați, documente, conținut).
   * @see docs/GROWTH_ENGINE.md §2.3
   */
  growthSafe?: boolean;
  payload: TPayload;
}
