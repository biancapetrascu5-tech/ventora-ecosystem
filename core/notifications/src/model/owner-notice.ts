import type { NotificationTemplate } from './catalog';
import type { NotificationParams, NotificationValueType } from './values';

/*
 * Lot 3.7 — what reaches the owner when someone who cannot buy (an admin or a member, D3-8)
 * presses „Recomandă” on an application (HubCatalogApp, UpgradeDialog) or „Anunță proprietarul”
 * on a pack or a limit (UsageMeter, HubAdminPlan). In the app only, in „Activitate”: it is a
 * message from the team, not an offer from Ventora Systems (D4-5). The texts are not drawn by
 * Design (DE VALIDAT, raportul 3.7); keys `ownerNotice.*` under `notifications`, 6 languages.
 */

export type OwnerNoticeKind = 'application' | 'addon' | 'quota';

export const ownerNoticeType = (kind: OwnerNoticeKind) => `owner_notice.${kind}`;

const PARAM_TYPES: Readonly<Record<string, NotificationValueType>> = {
  name: 'text',
  app: 'text',
  appId: 'text',
  pack: 'text',
  resource: 'key',
};

/** The application's page in the catalog; the rest open „Abonament și consum”. */
function actionPath(kind: OwnerNoticeKind) {
  if (kind !== 'application') return () => '/admin/plan';
  return (params: NotificationParams) => {
    const id = typeof params.appId === 'string' ? params.appId : '';
    return /^[a-z][a-z0-9_-]*$/.test(id) ? `/applications/${id}` : '/applications';
  };
}

export const OWNER_NOTICE_TEMPLATES: readonly NotificationTemplate[] = (
  ['application', 'addon', 'quota'] as const
).map((kind) => ({
  type: ownerNoticeType(kind),
  version: 1,
  category: 'operational',
  group: 'activity',
  titleKey: `ownerNotice.${kind}.title`,
  bodyKey: `ownerNotice.${kind}.body`,
  actionKey: `ownerNotice.${kind}.action`,
  actionPath: actionPath(kind),
  channels: [],
  paramTypes: PARAM_TYPES,
  // the same person, the same thing, once a day (the idempotency key); and not a flood
  rateLimit: { max: 20, windowMinutes: 60 },
}));
