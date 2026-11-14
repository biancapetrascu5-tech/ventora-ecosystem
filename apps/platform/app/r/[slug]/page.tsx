import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { readPublicPage } from '@/server/booking-public-actions';
import { PublicScreen } from '@/screens/booking/public/PublicScreen';

// Decision 7, screen 6 — the public booking page of a business (B.11a, D-B-5), without a session:
// app.ventora-hub.com/r/<slug>. An unknown slug (or a business without online booking) is a 404.
export const metadata: Metadata = { robots: { index: false } };

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await readPublicPage(slug);
  if (!page.ok) notFound();
  return <PublicScreen slug={slug} page={page.data} />;
}
