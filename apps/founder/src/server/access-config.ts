import { ensureAccessConfigured } from '@ventora/access';
import { commercialEntitlementProvider } from '@ventora/commercial';

/* Lot 2.8: authorize() / authorizeSupport() cer un EntitlementProvider configurat. Lot 3.2:
   provider-ul real — o aplicație e activă dacă dreptul efectiv al afacerii o include (abonamentul,
   pachetele, excepțiile, perioadele de probă); allAppsEnabledProvider rămâne doar în teste.
   Importat la încărcarea fiecărei acțiuni de server care trece prin core/access
   (instrumentation.ts nu poate, vezi comentariul de acolo). */
ensureAccessConfigured({ entitlementProvider: commercialEntitlementProvider });
