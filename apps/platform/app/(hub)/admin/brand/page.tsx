import { notFound } from 'next/navigation';
import { readBrand } from '@/server/brand-actions';
import { BrandScreen } from '@/screens/brand/BrandScreen';

export const dynamic = 'force-dynamic';

/* Afacerea › Brand (HubBrand, S148). Owner și admin schimbă; membrii văd, doar citire. Fără
   sesiune, fără afacere activă sau o afacere suspendată → 404. */
export default async function AdminBrandPage() {
  const data = await readBrand();
  if (!data) notFound();
  return <BrandScreen data={data} />;
}
