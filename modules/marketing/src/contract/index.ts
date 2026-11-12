export { getMarketingSettings, saveMarketingSettings } from './settings';
export type { MarketingSettings, MarketingSettingsInput } from './settings';
// Lot MK.2: the marketing contacts
export {
  createMarketingContact,
  dismissMarketingDuplicate,
  eraseMarketingContact,
  getMarketingContact,
  getMarketingContactHistory,
  listMarketingContacts,
  listMarketingDuplicates,
  mergeMarketingContacts,
  setMarketingContactArchived,
  updateMarketingContact,
} from './contacts';
export type {
  ContactEvent,
  ContactListQuery,
  DuplicatePair,
  MarketingContact,
  MarketingContactInput,
} from './contacts';
