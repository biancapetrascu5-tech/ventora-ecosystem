/*
 * The catalog of notification templates (Lot 4.3, brief §36: „Șabloane versionate. Categorii.”).
 * A notification is a template key + version, its category (D4-5, required), the group it is
 * shown in (display only), the channels it may use, and the i18n keys of its texts in the shared
 * catalogs (`packages/i18n`, namespace `notifications`, 6 languages). The texts are rendered
 * in the reader's language, at read time (in the app) or at delivery time (email).
 */

export type NotificationCategory = 'operational' | 'commercial';
/** Display only (D4-5): „Despre cont și funcționare” / „Activitate” / „Recomandări”. */
export type NotificationGroup = 'operational' | 'activity' | 'recommendation';
/** `in_app` is always written; delivery channels get a `delivery` row (D4-7: more later). */
export type DeliveryChannel = 'email' | 'sms' | (string & {});

export interface NotificationTemplate {
  type: string;
  version: number;
  category: NotificationCategory;
  group: NotificationGroup;
  /** i18n keys under `notifications` (dotted, without the namespace). */
  titleKey: string;
  bodyKey?: string;
  /** Delivery channels besides the app. Commercial email is blocked centrally (D-GRW-8). */
  channels: readonly DeliveryChannel[];
  /** Security messages cannot be turned off (S83). */
  security?: boolean;
  /** Cannot be turned off on email by the owner, by design (D4-6, BookingSmsNotifications). */
  emailLockedForOwner?: boolean;
  /** At most `max` per recipient in `windowMinutes` (deduplication beyond the idempotency key). */
  rateLimit?: { max: number; windowMinutes: number };
  /** The action, a path in the Hub (B-4: language-neutral). */
  actionPath?: (params: Readonly<Record<string, string>>) => string;
  /** The texts come later (Lot 4.5): the template exists, nothing is sent with it yet. */
  textsPending?: boolean;
}

export const NOTIFICATION_TEMPLATES: readonly NotificationTemplate[] = [
  {
    // ARCHITECTURE §15.1 (obligation left by F2): owner and admins, in the Hub, no email
    type: 'invitation.new_link_requested',
    version: 1,
    category: 'operational',
    group: 'activity',
    titleKey: 'invitation.newLinkRequested.title',
    channels: [],
    actionPath: () => '/admin/team',
  },
  {
    // Lot 3.3: 80% / 100% of a quota (texts: Lot 4.5)
    type: 'commercial.quota.threshold',
    version: 1,
    category: 'operational',
    group: 'operational',
    titleKey: 'quota.threshold.title',
    channels: ['email'],
    textsPending: true,
  },
  {
    // Lot 3.2: a plan version change scheduled for the business (texts: Lot 4.5)
    type: 'subscription.version_change_scheduled',
    version: 1,
    category: 'operational',
    group: 'operational',
    titleKey: 'subscription.versionChangeScheduled.title',
    channels: ['email'],
    textsPending: true,
  },
];

export class NotificationCatalog {
  private readonly byKey = new Map<string, NotificationTemplate>();

  constructor(templates: readonly NotificationTemplate[] = NOTIFICATION_TEMPLATES) {
    for (const t of templates) {
      const key = `${t.type}@${t.version}`;
      if (this.byKey.has(key)) throw new Error(`[notifications] template twice: ${key}`);
      if (t.category !== 'operational' && t.category !== 'commercial') {
        throw new Error(`[notifications] ${key}: category is required (D4-5)`);
      }
      this.byKey.set(key, t);
    }
  }

  get(type: string, version: number): NotificationTemplate | undefined {
    return this.byKey.get(`${type}@${version}`);
  }

  all(): NotificationTemplate[] {
    return [...this.byKey.values()];
  }
}

export const defaultCatalog = new NotificationCatalog();
