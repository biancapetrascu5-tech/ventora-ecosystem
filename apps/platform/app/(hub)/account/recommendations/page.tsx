import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@ventora/identity';
import { MyRecommendationsScreen } from '@/screens/recommendations/MyRecommendationsScreen';
import { readMyRecommendations } from '@/server/team-recommendation-actions';

export const dynamic = 'force-dynamic';

/* Contul tău · Recomandările mele (HubMyRecommendations, S136, lotul 5.9e): ce a recomandat
   persoana proprietarului și răspunsul. Fără afacere activă: înapoi în Contul tău. */
export default async function MyRecommendationsPage() {
  const session = await getSession(await headers());
  if (!session) redirect('/sign-in');
  const data = await readMyRecommendations();
  if (!data) redirect('/account');
  return <MyRecommendationsScreen data={data} />;
}
