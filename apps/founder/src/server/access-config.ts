import { ensureAccessConfigured } from '@ventora/access';
import { allAppsEnabledProvider } from '@ventora/contracts';

/* Lot 2.8: authorize() / authorizeSupport() cer un EntitlementProvider configurat. Până la
   modelul comercial (Faza 3, Lotul 3.2) toate aplicațiile sunt active (allAppsEnabledProvider),
   ca în modules/booking. Importat la încărcarea fiecărei acțiuni de server care trece prin
   core/access (instrumentation.ts nu poate, vezi comentariul de acolo). */
ensureAccessConfigured({ entitlementProvider: allAppsEnabledProvider });
