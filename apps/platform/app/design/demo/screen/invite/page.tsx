import { notFound } from 'next/navigation';
import { InviteScreenClient } from './client';

export const dynamic = 'force-dynamic';

export default async function InviteScreenPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; state?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = await searchParams;
  const theme = sp.theme === 'dark' ? 'dark' : 'light';
  const state = sp.state === 'expired' ? 'expired' : 'default';
  return <InviteScreenClient theme={theme} state={state} />;
}
