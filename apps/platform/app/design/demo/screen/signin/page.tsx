import { notFound } from 'next/navigation';
import { SigninScreenClient } from './client';

export const dynamic = 'force-dynamic';

export default async function SigninScreenPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; state?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = await searchParams;
  const theme = sp.theme === 'dark' ? 'dark' : 'light';
  const state = sp.state === 'error' ? 'error' : 'default';
  return <SigninScreenClient theme={theme} state={state} />;
}
