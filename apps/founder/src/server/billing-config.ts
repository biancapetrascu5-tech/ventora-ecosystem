import { setInvoiceApplicationNames } from '@ventora/billing';
import { APPS } from '@ventora/ui/apps';

/* Lotul 3.9a: Founder emite și el facturi („Reîncearcă”, factura de transfer a implementării,
   Lotul 3.8), deci numele aplicației pe factură vine din același loc ca în platform
   (apps/platform/src/server/billing-config.ts); id-ul rămâne când aplicația nu are nume. */
setInvoiceApplicationNames((id) => APPS[id]?.name ?? id);
