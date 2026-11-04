import { notFound } from 'next/navigation';
import { readPlan } from '@/server/plan-actions';
import { PlanScreen } from '@/screens/plan/PlanScreen';

export const dynamic = 'force-dynamic';

/* Administrare · Abonament și consum (HubAdminPlan / HubPlanBilling, Lotul 3.7). Owner și admin;
   un membru (sau o afacere suspendată) primește 404. Doar owner-ul vede cardul și facturile și
   cumpără (`billing.purchase`, verificat pe server). */
export default async function AdminPlanPage() {
  const data = await readPlan();
  if (!data) notFound();
  return <PlanScreen data={data} />;
}
