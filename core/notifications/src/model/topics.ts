import type { NotificationCategory } from './catalog';

/*
 * The topics of the preferences (Lot 4.4, S114b, D4-6): the rows of „Contul tău · Notificări”.
 * A template names its topic; the person's preference is kept per topic and channel.
 *
 *   - operational, e-mail switch per topic; in the app always on;
 *   - security: always on, in the app and by e-mail („Nu se pot opri”, S83) — never stored;
 *   - commercial: „Recomandări Ventora” (in-app switch; e-mail „Disponibil în curând”, D-GRW-8)
 *     and „Noutăți de la Ventora” (in-app switch; e-mail off until the person turns it on).
 */

export const EMAIL_TOPICS = ['bookings', 'phone', 'billing', 'limits', 'leave', 'support'] as const;
export const SECURITY_TOPICS = ['password', 'twoFactor', 'supportSession'] as const;
export const COMMERCIAL_TOPICS = ['recommendations', 'news'] as const;

export type EmailTopic = (typeof EMAIL_TOPICS)[number];
export type SecurityTopic = (typeof SECURITY_TOPICS)[number];
export type CommercialTopic = (typeof COMMERCIAL_TOPICS)[number];
export type NotificationTopic = EmailTopic | SecurityTopic | CommercialTopic;

export const isSecurityTopic = (t: string): t is SecurityTopic =>
  (SECURITY_TOPICS as readonly string[]).includes(t);
export const isEmailTopic = (t: string): t is EmailTopic =>
  (EMAIL_TOPICS as readonly string[]).includes(t);
export const isCommercialTopic = (t: string): t is CommercialTopic =>
  (COMMERCIAL_TOPICS as readonly string[]).includes(t);

export const topicCategory = (t: NotificationTopic): NotificationCategory =>
  isCommercialTopic(t) ? 'commercial' : 'operational';

/** The preferences the person can change; anything else is fixed. */
export function isChangeable(topic: string, channel: string): boolean {
  if (isEmailTopic(topic)) return channel === 'email';
  if (topic === 'recommendations') return channel === 'in_app'; // e-mail: D-GRW-8
  if (topic === 'news') return channel === 'in_app' || channel === 'email';
  return false;
}

/** Without a stored row: everything on, except the news by e-mail (S114b). */
export function defaultEnabled(topic: string, channel: string): boolean {
  return !(topic === 'news' && channel === 'email');
}
