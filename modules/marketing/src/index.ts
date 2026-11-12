export * from './contract/index';
export { manifest } from './manifest';
export type { MarketingPermission } from './manifest';
export { DEFAULT_MARKETING_SETTINGS, SETTINGS_LIMITS } from './server/settings';
// Lot MK.2: the limits and the lists for the screens; recordContactEventInTx for MK.9+ / MK.14
export {
  CONTACT_EVENT_KINDS,
  CONTACT_LIMITS,
  CONTACT_LOCALES,
  CONTACT_SOURCES,
  normalizeContact,
  recordContactEventInTx,
} from './server/contacts';
