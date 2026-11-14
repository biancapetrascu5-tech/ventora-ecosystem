import { NextResponse, type NextRequest } from 'next/server';
import { InvalidInput, ResourceNotFound } from '@ventora/errors';
import { readFileAsSystem } from '@ventora/files';
import { findBrandLogo } from '@ventora/organizations';
import { reportActionError } from '@/server/report-error';

export const dynamic = 'force-dynamic';

/* Brand Kit (S148, approved 14.11.2026): the business's logo, public, at a stable address — the
   switcher, the public EasyBook page and the e-mails to clients (an e-mail opens a week later, so
   not a 10-minute signed link; the id is a UUID v7, not guessable).
   - organizations.find_brand_logo: only the CURRENT logo of an ACTIVE business; a replaced or
     emptied logo, or one of a suspended business → 404, without saying which;
   - the bytes through core/files (readFileAsSystem, owner module `organizations`), as files_rw in
     that business's context;
   - a short cache (5 minutes), so a replaced logo or a suspension stops showing soon (the founder's
     condition: 404), and nosniff (the type is the one checked at the upload: PNG or JPEG). */
const NOT_FOUND = { status: 404, headers: { 'cache-control': 'no-store' } } as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const organizationId = await findBrandLogo(id);
    if (!organizationId) return new NextResponse(null, NOT_FOUND);
    const { info, bytes } = await readFileAsSystem(organizationId, {
      fileId: id,
      module: 'organizations',
    });
    if (info.contentType !== 'image/png' && info.contentType !== 'image/jpeg') {
      return new NextResponse(null, NOT_FOUND);
    }
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'content-type': info.contentType,
        'content-length': String(bytes.length),
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
        'cross-origin-resource-policy': 'cross-origin',
      },
    });
  } catch (err) {
    // a missing file is a 404 like the rest; only an unexpected error is reported
    if (!(err instanceof ResourceNotFound || err instanceof InvalidInput)) {
      reportActionError('brand.logo', err);
    }
    return new NextResponse(null, NOT_FOUND);
  }
}
