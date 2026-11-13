'use server';

import './access-config';
import { headers } from 'next/headers';
import {
  authorize,
  getMemberApplicationAccess,
  getTeamOwnerName,
  listTeamMembers,
  PLATFORM_APPLICATION_ID,
} from '@ventora/access';
import { getEffectiveEntitlements, listTrials } from '@ventora/commercial';
import {
  AccessRequestTooSoon,
  getMyAccessRequest,
  getOrganizationTimeZone,
  listAccessRequests,
  OrganizationSuspendedError,
  requestApplicationAccess,
  resolveOrgContext,
} from '@ventora/organizations';
import { supportEmail } from '@ventora/notifications';
import { listAppointments } from '@ventora/booking';
import { getSession, getUserById } from '@ventora/identity';
import type { AppName } from '@ventora/ui';
import { APP_GROUPS } from '@/screens/apps/content';
import { reportActionError } from './report-error';
import { computeLauncherApps, trialEnding, type LauncherApp } from './launcher-state';
import { readGrowthSlot, type GrowthSlotView } from './growth-slot';

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
  /** Slotul Growth din „Alte aplicații” (5.9a, `hub.launcher.other`); null: gol. */
  recommendation: GrowthSlotView | null;
  /** 5.9d (CommercialStates): proba care se încheie în cel mult 3 zile; doar pentru owner / admin. */
  trialEnding: { app: AppName; endsAt: string } | null;
  /** 5.1c (S146): cererea „Cere acces” a persoanei fără nicio aplicație; null: n-a cerut încă. */
  accessRequest: AccessRequestView | null;
  /** 5.1c: owner / admin — „Au nevoie de tine”: cine a cerut acces și încă n-are nicio aplicație. */
  needsYou: NeedsYouItem[];
  /** Adresa de suport, pentru eroarea „afacerea e suspendată” la trimitere. */
  supportEmail: string;
}

export interface AccessRequestView {
  requestedAt: string;
  canResendAt: string;
}

export interface NeedsYouItem {
  userId: string;
  name: string;
  role: string;
  requestedAt: string;
  /** A cerut din nou după 7 zile (requestCount > 1). */
  again: boolean;
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

    // Growth nu blochează niciodată launcher-ul: orice eroare = slot gol (§8.7)
    const recommendation = apps.some((a) => a.state !== 'available')
      ? await readGrowthSlot(ctx, 'hub.launcher.other')
      : null;

    const ending =
      ctx.role === 'owner' || ctx.role === 'admin'
        ? trialEnding(
            trials,
            apps.filter((a) => a.state === 'available').map((a) => a.app),
            now,
          )
        : null;

    // 5.1c: cererea apare doar cât timp persoana n-are nicio aplicație; nu blochează launcher-ul
    const empty = !apps.some((a) => a.state === 'available');
    const implicit = ctx.role === 'owner' || ctx.role === 'admin';
    const org = () =>
      resolveOrgContext({ userId: session.userId, organizationId: ctx.organizationId });
    const [mine, needsYou] = await Promise.all([
      empty && !implicit
        ? org()
            .then(getMyAccessRequest)
            .catch((err) => {
              reportActionError('readLauncher.accessRequest', err);
              return null;
            })
        : Promise.resolve(null),
      implicit
        ? org()
            .then((o) => readNeedsYou(o, session.token))
            .catch((err) => {
              reportActionError('readLauncher.needsYou', err);
              return [];
            })
        : Promise.resolve([]),
    ]);

    return {
      apps,
      role: ctx.role,
      ownerName,
      timeZone,
      appointmentsToday,
      recommendation,
      trialEnding: ending ? { app: ending.app, endsAt: ending.endsAt.toISOString() } : null,
      accessRequest: mine
        ? {
            requestedAt: mine.requestedAt.toISOString(),
            canResendAt: mine.canResendAt.toISOString(),
          }
        : null,
      needsYou,
      supportEmail: supportEmail(),
    };
  } catch (err) {
    reportActionError('readLauncher', err);
    return null;
  }
}

/**
 * „Au nevoie de tine” (S146): cererile membrilor activi care încă n-au nicio aplicație (cererea
 * dispare imediat ce persoana primește una). Numele și aplicațiile vin din echipă (core/access).
 */
async function readNeedsYou(
  ctx: Parameters<typeof listAccessRequests>[0],
  sessionToken: string,
): Promise<NeedsYouItem[]> {
  const requests = await listAccessRequests(ctx);
  if (requests.length === 0) return [];
  const members = new Map((await listTeamMembers({ sessionToken })).map((m) => [m.userId, m]));
  return requests.flatMap((r) => {
    const m = members.get(r.userId);
    if (!m || m.status !== 'active' || !m.applicationIds || m.applicationIds.length > 0) return [];
    return [
      {
        userId: r.userId,
        name: m.name,
        role: m.role,
        requestedAt: r.requestedAt.toISOString(),
        again: r.requestCount > 1,
      },
    ];
  });
}

export type RequestAccessResult =
  | { ok: true; request: AccessRequestView }
  | { ok: false; error: 'failed' | 'suspended' }
  | { ok: false; error: 'tooSoon'; canResendAt: string };

/**
 * 5.1c — „Cere acces” (S146). Doar o persoană care chiar n-are nicio aplicație (verificat aici, pe
 * server, ca pe launcher); numele trimis owner-ului vine din contul ei, nu din client.
 */
export async function requestAccess(): Promise<RequestAccessResult> {
  const session = await getSession(await headers());
  if (!session) return { ok: false, error: 'failed' };
  try {
    const ctx = await authorize({
      sessionToken: session.token,
      applicationId: PLATFORM_APPLICATION_ID,
    });
    if (ctx.role === 'owner' || ctx.role === 'admin') return { ok: false, error: 'failed' };
    const entitled = (await getEffectiveEntitlements(ctx.organizationId)).applications;
    const access = await Promise.all(
      LAUNCHER_APPS.filter((a) => entitled.includes(a)).map((a) =>
        getMemberApplicationAccess(ctx, ctx.userId, a),
      ),
    );
    if (access.some((a) => a.status === 'active' && a.hasAccess)) {
      return { ok: false, error: 'failed' };
    }
    const user = await getUserById(session.userId);
    const org = await resolveOrgContext({
      userId: session.userId,
      organizationId: ctx.organizationId,
    });
    const r = await requestApplicationAccess(org, {
      requesterName: user?.name?.trim() || user?.email || '',
    });
    return {
      ok: true,
      request: {
        requestedAt: r.requestedAt.toISOString(),
        canResendAt: r.canResendAt.toISOString(),
      },
    };
  } catch (err) {
    if (err instanceof OrganizationSuspendedError) return { ok: false, error: 'suspended' };
    if (err instanceof AccessRequestTooSoon) {
      return { ok: false, error: 'tooSoon', canResendAt: err.canResendAt.toISOString() };
    }
    reportActionError('requestAccess', err);
    return { ok: false, error: 'failed' };
  }
}
