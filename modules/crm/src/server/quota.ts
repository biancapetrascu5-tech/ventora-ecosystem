import { registerOperationResolver } from '@ventora/quota';
import { CONTACTS_QUOTA_KEY, contactQuotaHeld } from './contacts';

/*
 * Lot CR.2 — the reconciliation resolver of crm.contacts (ARCHITECTURE §8.3): a reservation left
 * after 15 minutes is committed when a contact holds it (created or restored, still active),
 * released otherwise (a process stopped between the transaction and the commit). Registered when
 * the contract is loaded, like booking.appointments, core/ai and workflows.
 */

let registered = false;

export function registerContactsQuotaResolver(): void {
  if (registered) return;
  registered = true;
  registerOperationResolver(CONTACTS_QUOTA_KEY, contactQuotaHeld);
}
