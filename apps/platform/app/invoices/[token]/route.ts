import { NextResponse, type NextRequest } from 'next/server';
import { InvoiceLinkRefused, openInvoiceLink } from '@ventora/billing';
import '@/server/billing-config';
import { reportActionError } from '@/server/report-error';

export const dynamic = 'force-dynamic';

/* Lotul 3.6 — „Descarcă PDF” (HubAdminPlan · Facturi): linkul semnat făcut de invoiceDownload
   (după authorize cu billing.purchase), valabil 5 minute. Valid → PDF-ul facturii, cerut de la
   SmartBill pe server (niciodată linkul public SmartBill); expirat → 410; altceva → 404, fără să
   spună dacă factura există. Refuzul se notează; o eroare neașteptată merge și în Sentry. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const { pdf, fileName } = await openInvoiceLink(token);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${fileName}"`,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    reportActionError('billing.openInvoiceLink', err);
    const status = err instanceof InvoiceLinkRefused ? err.status : 502;
    return new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });
  }
}
