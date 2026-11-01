import { notFound } from 'next/navigation';
import { readCatalog } from '@/server/catalog-actions';
import { CatalogScreen } from '@/screens/catalog/CatalogScreen';

export const dynamic = 'force-dynamic';

/* Catalogul Hub-ului · Bundle-uri (HubCatalogBundles, Lotul 3.4, S117). Pentru orice membru al
   afacerii active; doar owner-ul vede „Cere acest bundle”. Fără afacere activă (sau suspendată) → 404. */
export default async function CatalogPage() {
  const data = await readCatalog();
  if (!data) notFound();
  return <CatalogScreen data={data} />;
}
