import { db } from '../_db';
import { validateContact } from '../_contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

// Tests:
//   ?orgId=e7-org-alpha&contactId=e7-contact-alpha-1  → ok
//   ?orgId=e7-org-alpha&contactId=e7-contact-beta-1   → CrossOrgContact
//   ?orgId=e7-org-disabled&contactId=e7-contact-alpha-1 → AppNotEnabled
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId') ?? '';
  const contactId = searchParams.get('contactId') ?? '';

  if (!orgId || !contactId) {
    return Response.json({ error: 'orgId and contactId required' }, { status: 400 });
  }

  const t0 = performance.now();
  const result = await validateContact(orgId, contactId, db);
  const ms = performance.now() - t0;

  return Response.json({ ...result, orgId, contactId, ms });
}
