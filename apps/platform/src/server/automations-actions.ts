'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize, PLATFORM_APPLICATION_ID } from '@ventora/access';
import { getSession } from '@ventora/identity';
import { createSupportRequest, newSupportRequestId, resolveSupportActor } from '@ventora/support';
import {
  getAutomationsForHub,
  setAutomationSetting,
  type BusinessSettings,
} from '@ventora/workflows';
import { reportActionError } from './report-error';

/* Lotul 4.10 — HubAutomations (Afacerea · Automatizări). Owner și admin văd lista; un membru vede
   doar nota (S116); afacerea vine din sesiune prin authorize(), niciodată din client. Pornirea și
   oprirea nu există aici (D-WF-3): doar Founder, iar workflows_rw nu are drept de scriere pe
   activări. Setările afacerii (S116-D22) se scriu prin core/workflows.

   „Cere pornirea” / „Cere o schimbare”: o solicitare de suport (Lotul 4.6), în aplicația
   automatizării (EasyBook sau Hub); echipa răspunde la Suport și pe e-mail. */

export type HubAutomationsData =
  | { member: true }
  | {
      member: false;
      automations: {
        id: string;
        code: string;
        name: string;
        booking: boolean;
        on: boolean;
        /** ISO; null: nu a trimis nimic. */
        lastSentAt: string | null;
        lastSentCount: number;
        settings: BusinessSettings;
      }[];
      messagesThisMonth: number;
    };

async function context() {
  const session = await getSession(await headers());
  if (!session) return null;
  return authorize({ sessionToken: session.token, applicationId: PLATFORM_APPLICATION_ID });
}

/** null: fără sesiune sau afacere suspendată → pagina dă 404. */
export async function readAutomations(): Promise<HubAutomationsData | null> {
  try {
    const ctx = await context();
    if (!ctx) return null;
    if (ctx.role !== 'owner' && ctx.role !== 'admin') return { member: true };
    const data = await getAutomationsForHub(ctx);
    return {
      member: false,
      automations: data.automations.map((a) => ({
        id: a.definitionId,
        code: a.code,
        name: a.name,
        booking: a.trigger.startsWith('booking.'),
        on: a.on,
        lastSentAt: a.lastSentAt ? new Date(a.lastSentAt).toISOString() : null,
        lastSentCount: a.lastSentCount,
        settings: a.settings,
      })),
      messagesThisMonth: data.messagesThisMonth,
    };
  } catch (err) {
    reportActionError('readAutomations', err);
    return null;
  }
}

/** S116-D22: săptămânile pentru reactivare, reducerea de ziua clientului. */
export async function saveAutomationSetting(
  definitionId: string,
  settings: BusinessSettings,
): Promise<{ ok: boolean }> {
  try {
    const ctx = await context();
    if (!ctx) return { ok: false };
    await setAutomationSetting(ctx, { definitionId, settings });
    return { ok: true };
  } catch (err) {
    reportActionError('saveAutomationSetting', err);
    return { ok: false };
  }
}

/** „Cere pornirea” / „Cere o schimbare”: o solicitare de suport, cu textele în limba persoanei. */
export async function askAutomation(input: {
  booking: boolean;
  subject: string;
  description: string;
}): Promise<{ ok: boolean; ref?: string }> {
  try {
    const session = await getSession(await headers());
    if (!session?.token) return { ok: false };
    const actor = await resolveSupportActor(session.token);
    const { ref } = await createSupportRequest(actor, {
      id: newSupportRequestId(),
      applicationId: input.booking ? 'booking' : 'platform',
      subject: input.subject,
      description: input.description,
      urgency: 'normal',
    });
    return { ok: true, ref };
  } catch (err) {
    reportActionError('askAutomation', err);
    return { ok: false };
  }
}
