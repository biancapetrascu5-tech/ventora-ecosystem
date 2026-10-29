import { notFound } from 'next/navigation';
import { LauncherScreenClient } from './client';

export const dynamic = 'force-dynamic';

export default async function LauncherScreenPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; app?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sp = await searchParams;
  const theme = sp.theme === 'dark' ? 'dark' : 'light';
  const app = (sp.app as string) ?? 'none';
  return <LauncherScreenClient theme={theme} activeApp={app} />;
}
