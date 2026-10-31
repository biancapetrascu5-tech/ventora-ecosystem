/**
 * Lot 3.1: the registry of applications (ARCHITECTURE §5: 15 applications, the number does not
 * change) plus `platform` — the Hub and the Core services, which own the keys no application
 * owns (members, locations, messaging…). Ids are the ones the design and `access` already use
 * (AppIcon, application_access); names are the product names from the design (AppIcon APPS).
 * Only one module exists in this repo (booking); the others get a manifest when they are built.
 */
export interface RegistryApplication {
  id: string;
  name: string;
  isPlatform: boolean;
}

export const APPLICATIONS: readonly RegistryApplication[] = [
  { id: 'platform', name: 'Ventora Hub', isPlatform: true },
  { id: 'booking', name: 'EasyBook', isPlatform: false },
  { id: 'crm', name: 'ClientDesk', isPlatform: false },
  { id: 'documents', name: 'DocSpace', isPlatform: false },
  { id: 'contracts', name: 'ContractDesk', isPlatform: false },
  { id: 'events', name: 'EventSpace', isPlatform: false },
  { id: 'hr', name: 'TeamSpace', isPlatform: false },
  { id: 'inventory', name: 'StockDesk', isPlatform: false },
  { id: 'shifts', name: 'ShiftPlan', isPlatform: false },
  { id: 'marketing', name: 'CampaignKit', isPlatform: false },
  { id: 'analytics', name: 'DataView', isPlatform: false },
  { id: 'assets', name: 'AssetDesk', isPlatform: false },
  { id: 'projects', name: 'TaskBoard', isPlatform: false },
  { id: 'finance', name: 'MoneyDesk', isPlatform: false },
  { id: 'portal', name: 'Portal', isPlatform: false },
  { id: 'network', name: 'Network', isPlatform: false },
];
