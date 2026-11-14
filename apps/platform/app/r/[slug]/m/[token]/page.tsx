import type { Metadata } from 'next';
import { readManagedBooking, readPublicPage } from '@/server/booking-public-actions';
import { ManageScreen } from '@/screens/booking/public/ManageScreen';
import { ManageInvalidScreen } from '@/screens/booking/public/ManageInvalidScreen';

// Decision 7, screen 6 — the client's page for moving or cancelling (B.11b), from the link in the
// confirmation e-mail, without an account. An unknown, malformed or revoked link shows „Linkul nu
// mai e valabil” (S125 / S146), never whose booking it was.
export const metadata: Metadata = { robots: { index: false } };

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const booking = await readManagedBooking(slug, token);
  if (!booking.ok) {
    const page = await readPublicPage(slug);
    return (
      <ManageInvalidScreen
        slug={slug}
        business={
          page.ok ? { name: page.data.name, address: page.data.locations[0]?.address ?? '' } : null
        }
      />
    );
  }
  return <ManageScreen slug={slug} token={token} booking={booking.data} />;
}
