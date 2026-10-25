import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

type OrgRole = 'member' | 'admin' | 'owner';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  const action = body.action as string;

  if (action === 'create-user') {
    const result = await auth.api.signUpEmail({
      body: {
        email: body.email as string,
        password: body.password as string,
        name: body.name as string,
      },
    });
    return NextResponse.json(result);
  }

  if (action === 'create-org') {
    const result = await auth.api.createOrganization({
      headers: req.headers,
      body: {
        name: body.name as string,
        slug: body.slug as string,
      },
    });
    return NextResponse.json(result);
  }

  if (action === 'add-member') {
    const result = await auth.api.addMember({
      body: {
        organizationId: body.organizationId as string,
        userId: body.userId as string,
        role: body.role as OrgRole,
      },
    });
    return NextResponse.json(result);
  }

  if (action === 'update-member-role') {
    const result = await auth.api.updateMemberRole({
      headers: req.headers,
      body: {
        organizationId: body.organizationId as string,
        memberId: body.memberId as string,
        role: body.role as OrgRole,
      },
    });
    return NextResponse.json(result);
  }

  if (action === 'revoke-session') {
    const result = await auth.api.revokeSession({
      headers: req.headers,
      body: { token: body.token as string },
    });
    return NextResponse.json(result);
  }

  if (action === 'set-active-org') {
    const result = await auth.api.setActiveOrganization({
      headers: req.headers,
      body: { organizationId: body.organizationId as string },
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
