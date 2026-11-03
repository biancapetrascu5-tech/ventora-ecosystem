import { NextResponse, type NextRequest } from 'next/server';
import { FileLinkRefused, openDownloadLink } from '@ventora/files';
import { reportActionError } from '@/server/report-error';

export const dynamic = 'force-dynamic';

/* Lot 4.7 (ARCHITECTURE §12.4): a download link made by getDownloadLink, after authorize(). The
   link is signed and expiring, so it works the same from the browser and the mobile app, without a
   session. Valid → a storage URL for a minute; expired → 410; anything else → 404, without saying
   whether the file exists. The refusal is logged; an unexpected error also goes to Sentry. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const url = await openDownloadLink(token);
    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  } catch (err) {
    reportActionError('files.openDownloadLink', err);
    const status = err instanceof FileLinkRefused ? err.status : 500;
    return new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });
  }
}
