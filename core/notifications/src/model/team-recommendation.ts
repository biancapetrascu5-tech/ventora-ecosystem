import type { NotificationTemplate } from './catalog';
import type { NotificationParams, NotificationValueType } from './values';

/*
 * Lot 5.9e — „{owner} a activat {app}” (HubMyRecommendations, CommercialStates, S136): ajunge la
 * cine a recomandat aplicația, când aplicația intră în abonament. Doar activarea trimite o
 * notificare; „Nu acum” nu (membrul o vede în „Recomandările mele”). În aplicație, la
 * „Activitate”; cheile `teamRecommendation.activated.*` sub `notifications`, 6 limbi (din
 * `mine.n.*` și `states.activated.action` din i18n/commercial.json).
 */

export const TEAM_RECOMMENDATION_ACTIVATED = 'team_recommendation.activated';

const PARAM_TYPES: Readonly<Record<string, NotificationValueType>> = {
  owner: 'text',
  app: 'text',
  appId: 'text',
};

/** „Deschide {app}”: EasyBook are rutele lui; restul, pagina aplicației. */
function actionPath(params: NotificationParams) {
  const id = typeof params.appId === 'string' ? params.appId : '';
  if (id === 'booking') return '/booking';
  return /^[a-z][a-z0-9_-]*$/.test(id) ? `/applications/${id}` : '/applications';
}

export const TEAM_RECOMMENDATION_TEMPLATES: readonly NotificationTemplate[] = [
  {
    type: TEAM_RECOMMENDATION_ACTIVATED,
    version: 1,
    category: 'operational',
    group: 'activity',
    titleKey: 'teamRecommendation.activated.title',
    bodyKey: 'teamRecommendation.activated.body',
    actionKey: 'teamRecommendation.activated.action',
    actionPath,
    channels: [],
    paramTypes: PARAM_TYPES,
    rateLimit: { max: 20, windowMinutes: 60 },
  },
];
