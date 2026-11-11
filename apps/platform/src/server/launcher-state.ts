import type { AppName } from '@ventora/ui';

/*
 * Lotul 5.1 (D5-3 = a) — starea unei aplicații în launcher, pură (testată fără server):
 *   available   → în abonament (sau în probă) și în rolul persoanei;
 *   notInRole   → în abonament, dar nu în rolul persoanei;
 *   unavailable → proba ei s-a încheiat și n-a fost activată;
 *   notInPlan   → nu e în abonament.
 * Owner-ul și adminul au implicit toate aplicațiile afacerii (ADR-0004); ceilalți, doar cu
 * accesul pe aplicație (ca authorize()).
 */

export type LauncherState = 'available' | 'notInRole' | 'unavailable' | 'notInPlan';

export interface LauncherApp {
  app: AppName;
  state: LauncherState;
  /** `trialEnded`: starea `unavailable` vine din proba încheiată. */
  reason?: 'trialEnded';
}

export interface LauncherTrial {
  kind: 'application' | 'feature';
  applicationId: string | null;
  endsAt: Date;
  endedAt: Date | null;
}

export async function computeLauncherApps(input: {
  apps: readonly AppName[];
  /** Aplicațiile pornite acum (din drepturile comerciale, cu probele active). */
  entitled: readonly string[];
  trials: readonly LauncherTrial[];
  role: string;
  /** Doar pentru membrii fără acces implicit: are persoana aplicația în rolul ei? */
  hasAccess: (app: AppName) => Promise<boolean>;
  now: Date;
}): Promise<LauncherApp[]> {
  const implicit = input.role === 'owner' || input.role === 'admin';
  const entitled = new Set(input.entitled);
  const trialEnded = new Set(
    input.trials
      .filter(
        (t) =>
          t.kind === 'application' &&
          t.applicationId !== null &&
          (t.endedAt !== null || t.endsAt <= input.now),
      )
      .map((t) => t.applicationId as string),
  );
  const out: LauncherApp[] = [];
  for (const app of input.apps) {
    if (entitled.has(app)) {
      const has = implicit || (await input.hasAccess(app));
      out.push({ app, state: has ? 'available' : 'notInRole' });
    } else if (trialEnded.has(app)) {
      out.push({ app, state: 'unavailable', reason: 'trialEnded' });
    } else {
      out.push({ app, state: 'notInPlan' });
    }
  }
  return out;
}
