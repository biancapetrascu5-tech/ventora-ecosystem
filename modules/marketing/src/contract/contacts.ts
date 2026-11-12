import { authorize } from '@ventora/access';
import {
  createContactInOrg,
  dismissDuplicateInOrg,
  getContactHistoryInOrg,
  getContactInOrg,
  listContactsInOrg,
  listDuplicatesInOrg,
  mergeContactsInOrg,
  setContactArchivedInOrg,
  updateContactInOrg,
  type ContactEvent,
  type ContactListQuery,
  type DuplicatePair,
  type MarketingContact,
  type MarketingContactInput,
} from '../server/contacts';

/*
 * Lot MK.2 — the marketing contacts. Every contract starts with authorize() (application
 * marketing); the organization comes only from the session. Reading needs marketing:read;
 * creating, editing, archiving, merging and dismissing a pair need marketing:write. The import
 * (marketing:import) and the export (marketing:export) come in MK.3.
 */

type Session = { sessionToken: string };

const read = (s: Session) =>
  authorize({
    sessionToken: s.sessionToken,
    applicationId: 'marketing',
    permission: 'marketing:read',
  });
const write = (s: Session) =>
  authorize({
    sessionToken: s.sessionToken,
    applicationId: 'marketing',
    permission: 'marketing:write',
  });

export async function listMarketingContacts(
  params: Session & { query?: ContactListQuery },
): Promise<{ contacts: MarketingContact[]; nextBefore: string | null }> {
  return listContactsInOrg(await read(params), params.query);
}

export async function getMarketingContact(
  params: Session & { contactId: string },
): Promise<MarketingContact> {
  return getContactInOrg(await read(params), params.contactId);
}

export async function getMarketingContactHistory(
  params: Session & { contactId: string },
): Promise<ContactEvent[]> {
  return getContactHistoryInOrg(await read(params), params.contactId);
}

/** A contact added by hand (source manual); audited. */
export async function createMarketingContact(
  params: Session & { contact: MarketingContactInput },
): Promise<MarketingContact> {
  return createContactInOrg(await write(params), params.contact, 'manual');
}

export async function updateMarketingContact(
  params: Session & { contactId: string; contact: MarketingContactInput },
): Promise<MarketingContact> {
  return updateContactInOrg(await write(params), params.contactId, params.contact);
}

export async function setMarketingContactArchived(
  params: Session & { contactId: string; archived: boolean },
): Promise<{ changed: boolean }> {
  return setContactArchivedInOrg(await write(params), params.contactId, params.archived);
}

export async function listMarketingDuplicates(params: Session): Promise<DuplicatePair[]> {
  return listDuplicatesInOrg(await read(params));
}

export async function dismissMarketingDuplicate(
  params: Session & { contactId: string; otherId: string },
): Promise<void> {
  return dismissDuplicateInOrg(await write(params), params.contactId, params.otherId);
}

export async function mergeMarketingContacts(
  params: Session & { keepId: string; duplicateId: string },
): Promise<MarketingContact> {
  return mergeContactsInOrg(await write(params), params.keepId, params.duplicateId);
}

export type {
  ContactEvent,
  ContactListQuery,
  DuplicatePair,
  MarketingContact,
  MarketingContactInput,
};
