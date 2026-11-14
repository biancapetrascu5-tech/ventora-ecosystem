import { NextResponse, type NextRequest } from 'next/server';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { readPersonalFile } from '@ventora/files';
import { getSession } from '@ventora/identity';
import { reportActionError } from '@/server/report-error';

export const dynamic = 'force-dynamic';

/* S147: the person's profile photo (files.personal_file), shown only to the person (the business
   switcher, the account menu, „Contul tău”). Only with a session; the person comes from it, and
   RLS on app.user_id keeps everyone to their own files: another person's photo, a replaced or a
   deleted one → 404, without saying which. Private cache only. */
const NOT_FOUND = { status: 404, headers: { 'cache-control': 'no-store' } } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getSession(req.headers);
    if (!session) return new NextResponse(null, NOT_FOUND);
    const { info, bytes } = await readPersonalFile(session.userId, id);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'content-type': info.contentType,
        'content-length': String(bytes.length),
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      },
    });
  } catch (err) {
    if (!(err instanceof ResourceNotFound || err instanceof InvalidInput)) {
      reportActionError('account.photo', err);
    }
    return new NextResponse(null, NOT_FOUND);
  }
}
