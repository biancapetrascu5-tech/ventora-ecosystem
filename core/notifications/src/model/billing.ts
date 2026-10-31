import type { NotificationTemplate } from './catalog';

/*
 * Lot 4.5 — the Phase 3 notifications (FAZA-3 §3.10, design S115 BillingNotifications): the
 * invoice, the failed payment, the limits at 80% / 100%, the 30-day notice, the trial, the setup
 * cost and the non-payment. All operational (they are about the account, not offers): in the app
 * always, by e-mail on the „Facturi și plăți” / „Limitele abonamentului” rows (S114b).
 *
 * The owner's variant has the e-mail (single operational template S3: subject „{title} ·
 * {business}”, the in-app text as preheader, lead, what happens next, the action as the button);
 * the variants for everyone else are in the app only, as drawn. The texts are Design's
 * (i18n/notifications.json, 6 languages, D4-12 a); keys `billing.*` and `email.billing.*` under
 * the `notifications` namespace.
 */

/** HubAdminPlan („Abonament și consum”, Lot 3.7). DE CONFIRMAT la 3.7: ruta ecranului. */
const PLAN = '/admin/plan';

const BILLING_IDS = [
  'invoice.card',
  'invoice.transfer',
  'invoice.pack',
  'payment.renewal',
  'payment.pack',
  'payment.retry',
  'payment.lastRetry',
  'limit.owner80',
  'limit.owner100',
  'planChange',
  'trial.ending',
  'trial.ended',
  'setup.accepted',
  'setup.due',
  'setup.started',
  'readonly.owner',
  'restored',
] as const;
/** The variants for everyone else: in the app only (S115 draws no e-mail for them). */
const BILLING_IN_APP_IDS = ['limit.other80', 'limit.other100', 'readonly.member'] as const;

export type BillingTemplateId = (typeof BILLING_IDS)[number] | (typeof BILLING_IN_APP_IDS)[number];

const isLimit = (id: string) => id.startsWith('limit.');
const isApps = (id: string) => id.startsWith('trial.') || id.startsWith('setup.');

function actionPath(id: BillingTemplateId): string | undefined {
  if (id === 'setup.started') return '/'; // „Deschide {app}”: the apps of the business, in the Hub
  // „Anunță proprietarul”: only the owner buys; what the button does comes with Lot 3.7
  if (id === 'limit.other80' || id === 'limit.other100' || id === 'readonly.member') {
    return undefined;
  }
  return PLAN;
}

export const billingType = (id: BillingTemplateId) => `billing.${id}`;

function template(id: BillingTemplateId, withEmail: boolean): NotificationTemplate {
  const path = actionPath(id);
  return {
    type: billingType(id),
    version: 1,
    category: 'operational',
    group: 'operational',
    titleKey: `billing.${id}.title`,
    bodyKey: `billing.${id}.body`,
    actionKey: `billing.${id}.action`,
    ...(path ? { actionPath: () => path } : {}),
    channels: withEmail ? ['email'] : [],
    topic: isLimit(id) ? 'limits' : 'billing',
    ...(withEmail
      ? {
          email: {
            subjectKey: 'email.billing.subject',
            eyebrowKey: isApps(id) ? 'email.billing.eyebrowApps' : 'email.billing.eyebrow',
            leadKey: `email.billing.${id}.lead`,
            nextKeys: [
              `email.billing.${id}.next`,
              // S115: at 100%, the owner's e-mail also says another plan can be asked for
              ...(id === 'limit.owner100' ? ['email.billing.upgrade'] : []),
            ],
            whyKey: 'email.billing.why',
          },
        }
      : {}),
  };
}

export const BILLING_TEMPLATES: readonly NotificationTemplate[] = [
  ...BILLING_IDS.map((id) => template(id, true)),
  ...BILLING_IN_APP_IDS.map((id) => template(id, false)),
];

/**
 * What F3 sends (one call per event, `notifyBillingInTx` in core/organizations): the owner's
 * variant and, where the design has one, the variant for everyone else in the business.
 */
export const BILLING_KINDS = {
  'invoice.card': { owner: 'invoice.card' },
  'invoice.transfer': { owner: 'invoice.transfer' },
  'invoice.pack': { owner: 'invoice.pack' },
  'payment.renewal': { owner: 'payment.renewal' },
  'payment.pack': { owner: 'payment.pack' },
  'payment.retry': { owner: 'payment.retry' },
  'payment.lastRetry': { owner: 'payment.lastRetry' },
  limit80: { owner: 'limit.owner80', others: 'limit.other80' },
  limit100: { owner: 'limit.owner100', others: 'limit.other100' },
  planChange: { owner: 'planChange' },
  'trial.ending': { owner: 'trial.ending' },
  'trial.ended': { owner: 'trial.ended' },
  'setup.accepted': { owner: 'setup.accepted' },
  'setup.due': { owner: 'setup.due' },
  'setup.started': { owner: 'setup.started' },
  readonly: { owner: 'readonly.owner', others: 'readonly.member' },
  restored: { owner: 'restored' },
} as const satisfies Record<string, { owner: BillingTemplateId; others?: BillingTemplateId }>;

export type BillingKind = keyof typeof BILLING_KINDS;
