'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  authorize,
  getMemberApplicationAccess,
  getTeamOwnerName,
  PLATFORM_APPLICATION_ID,
} from '@ventora/access';
import { getEffectiveEntitlements, listTrials } from '@ventora/commercial';
import { getOrganizationTimeZone } from '@ventora/organizations';
import { listAppointments } from '@ventora/booking';
import { getSession } from '@ventora/identity';
import type { AppName } from '@ventora/ui';
import { APP_GROUPS } from '@/screens/apps/content';
import { reportActionError } from './report-error';
import { computeLauncherApps, type LauncherApp } from './launcher-state';

/*
 * Lotul 5.1 (FAZA-5, D5-3 = a) — HubLauncher: starea fiecărei aplicații, calculată pe server, din
 * contractele serviciilor (niciodată din client):
 *   available → aplicația e în abonament (sau în probă) și rolul persoanei o are (owner și admin
 *               le au pe toate, ADR-0004; ceilalți prin accesul pe aplicație, ca authorize());
 *   notInRole → e în abonament, dar rolul persoanei nu o are;
 *   unavailable → proba ei s-a încheiat și n-a fost activată (aplicația s-a oprit, datele rămân);
 *   notInPlan → nu e în abonament.
 * Deschiderea rămâne apărată de authorize() pe fiecare rută: starea de aici doar arată.
 * Portal nu apare (D5-16: încă nu există). Fraza zilei: „Azi ai N programări.” doar cu EasyBook
 * disponibil persoanei (D5-17); altfel o propoziție simplă.
 */

export interface LauncherData {
  apps: LauncherApp[];
  role: string;
  /** Numele owner-ului, pentru „{who} îți poate da acces”; null pentru owner. */
  ownerName: string | null;
  timeZone: string;
  /** Programările de azi în EasyBook (ale persoanei, după regulile EasyBook); null: fără EasyBook. */
  appointmentsToday: number | null;
}

/** Ora 00:00 a zilei `date` (YYYY-MM-DD) în fusul `timeZone`, ca instant UTC. */
function zonedMidnight(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const offset = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
        .formatToParts(new Date(at))
        .map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

function todayIn(timeZone: string, now: Date): { from: Date; to: Date } {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const from = zonedMidnight(day, timeZone);
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { from, to: zonedMidnight(next, timeZone) };
}

const LAUNCHER_APPS: AppName[] = APP_GROUPS.flatMap(([, apps]) => apps).filter(
  (a) => a !== 'portal',
);

/** null: fără sesiune, fără afacere activă sau afacere suspendată. */
export async function readLauncher(): Promise<LauncherData | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    const now = new Date();
    const [entitlements, trials, timeZone, ownerName] = await Promise.all([
      getEffectiveEntitlements(ctx.organizationId),
      listTrials(ctx.organizationId),
      getOrganizationTimeZone(ctx),
      ctx.role === 'owner'
        ? Promise.resolve(null)
        : getTeamOwnerName({ sessionToken: session.token }),
    ]);
    const apps = await computeLauncherApps({
      apps: LAUNCHER_APPS,
      entitled: entitlements.applications,
      trials,
      role: ctx.role,
      hasAccess: async (app) => {
        const access = await getMemberApplicationAccess(ctx, ctx.userId, app);
        return access.status === 'active' && access.hasAccess;
      },
      now,
    });

    let appointmentsToday: number | null = null;
    if (apps.some((a) => a.app === 'booking' && a.state === 'available')) {
      try {
        const { from, to } = todayIn(timeZone, now);
        const { total } = await listAppointments({
          sessionToken: session.token,
          from: from.toISOString(),
          to: to.toISOString(),
          status: ['awaiting_payment', 'unconfirmed', 'confirmed', 'in_progress', 'completed'],
          limit: 1,
        });
        appointmentsToday = total;
      } catch (err) {
        // EasyBook nu răspunde: fraza simplă, launcher-ul rămâne
        reportActionError('readLauncher.appointments', err);
      }
    }

    return { apps, role: ctx.role, ownerName, timeZone, appointmentsToday };
  } catch (err) {
    reportActionError('readLauncher', err);
    return null;
  }
}
