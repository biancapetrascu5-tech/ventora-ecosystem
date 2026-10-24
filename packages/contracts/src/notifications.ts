/**
 * Categoria obligatorie a fiecărei notificări din ecosistem.
 * Preferințele utilizatorului sunt separate pe categorie.
 *
 * - operational: informații despre acțiunile proprii și starea serviciului.
 *   Nu poate fi dezactivat de utilizator.
 * - commercial: oferte, recomandări, campanii Growth Engine.
 *   Supus plafoanelor și preferințelor comerciale.
 *
 * @see docs/ARCHITECTURE.md §4 (core/notifications), docs/GROWTH_ENGINE.md §0.5
 */
export type NotificationCategory = 'operational' | 'commercial';
