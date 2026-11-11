// The public contract of ClientDesk, the only import allowed from outside the module
// (`@ventora/crm`). CR.1: the preferences; CR.2: the contacts and the companies.
export { getCrmSettings } from './settings';
export type { CrmSettings } from './settings';
export {
  assignContact,
  createCompany,
  createContact,
  createCustomField,
  deleteCustomField,
  listCustomFields,
  restoreCustomField,
  setCompanyCustomValues,
  setContactCustomValues,
  updateCustomField,
  deleteCompany,
  deleteContact,
  getCompany,
  getContact,
  listCompanies,
  listContacts,
  lookupCompanyByCui,
  restoreCompany,
  restoreContact,
  setContactCompany,
  updateCompany,
  updateContact,
} from './contacts';
export type {
  AnafLookup,
  Company,
  Contact,
  CreateContactParams,
  CustomField,
  CustomValues,
  ListContactsParams,
} from './contacts';
