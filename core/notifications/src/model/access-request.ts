import type { NotificationTemplate } from './catalog';
import type { NotificationValueType } from './values';

/*
 * Lot 5.1c (S146 „Cere acces”): a person with a role but no application asks for access; the owner
 * and the admins get it in the app (Activitate), with „Deschide Echipa”. Keys
 * `notifications.access.request.*` (design S146, 6 languages). Params: the person's name, the
 * role (a key of `email.roles.*`), the business.
 */

export const ACCESS_REQUEST_TYPE = 'access.request';

const PARAM_TYPES: Readonly<Record<string, NotificationValueType>> = {
  name: 'text',
  role: 'key',
  business: 'text',
};

export const ACCESS_REQUEST_TEMPLATES: readonly NotificationTemplate[] = [
  {
    type: ACCESS_REQUEST_TYPE,
    version: 1,
    category: 'operational',
    group: 'activity',
    titleKey: 'access.request.title',
    bodyKey: 'access.request.body',
    actionKey: 'access.request.action',
    actionPath: () => '/admin/team',
    channels: [],
    paramTypes: PARAM_TYPES,
    // one request per person a week (the contract); the rate limit only stops a flood
    rateLimit: { max: 20, windowMinutes: 60 },
  },
];
