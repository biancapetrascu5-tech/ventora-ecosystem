import type { GrowthOfferTarget } from '@ventora/contracts';
import { withRegistryRead } from './db';

/*
 * Lot 5.9f (P22, S136): „Eroare: oferta nu se mai potrivește cu modelul comercial”. Growth nu are
 * produse și nici drepturi pe schema commercial (GROWTH §1), deci job-ul lui întreabă aici, prin
 * contract, dacă ținta fiecărei oferte active mai există și mai are preț. Doar catalogul comun
 * (fără afaceri), într-o singură tranzacție de citire, cu câte o interogare pe tip de țintă.
 */

export type OfferTargetProblemCode =
  | 'app_retired'
  | 'app_no_price'
  | 'feature_retired'
  | 'addon_missing'
  | 'addon_sales_stopped'
  | 'addon_no_price'
  | 'plan_missing'
  | 'plan_not_on_sale'
  | 'plan_no_price';

export interface OfferTargetProblem {
  code: OfferTargetProblemCode;
  /** Numele din catalog (aplicația, pachetul, abonamentul), pentru text; gol dacă lipsește. */
  name: string;
}

/** Cheia stabilă a unei ținte, aceeași în ambele părți. */
export function offerTargetKey(t: GrowthOfferTarget): string {
  switch (t.type) {
    case 'app_activation':
      return `app:${t.applicationId}`;
    case 'trial':
      return t.applicationId ? `app:${t.applicationId}` : `feature:${t.featureKey ?? ''}`;
    case 'addon':
      return `addon:${t.addonCode}`;
    case 'plan_upgrade':
    case 'bundle':
      return `plan:${t.planVersionId}`;
  }
}

/**
 * Pentru fiecare țintă: problema găsită, sau null dacă se potrivește cu modelul comercial.
 * O aplicație fără niciun preț nu se poate vinde, deci e eroare și pentru o probă (se cere
 * aplicația la sfârșitul probei). O funcționalitate retrasă nu mai are ce proba.
 */
export async function checkOfferTargets(
  targets: readonly GrowthOfferTarget[],
): Promise<Map<string, OfferTargetProblem | null>> {
  const keys = [...new Set(targets.map(offerTargetKey))];
  const result = new Map<string, OfferTargetProblem | null>(keys.map((k) => [k, null]));
  if (keys.length === 0) return result;
  const ids = (prefix: string) =>
    keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const apps = ids('app:');
  const features = ids('feature:');
  const addons = ids('addon:');
  const plans = ids('plan:').filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  await withRegistryRead('app', async (c) => {
    if (apps.length) {
      const { rows } = await c.query<{
        id: string;
        name: string;
        retired: boolean;
        priced: boolean;
      }>(
        `SELECT a.id, a.name, a.retired_at IS NOT NULL AS retired,
                EXISTS (SELECT 1 FROM commercial.application_price p
                         WHERE p.application_id = a.id) AS priced
           FROM commercial.application a WHERE a.id = ANY($1::text[])`,
        [apps],
      );
      const found = new Map(rows.map((r) => [r.id, r]));
      for (const id of apps) {
        const r = found.get(id);
        if (!r || r.retired) result.set(`app:${id}`, { code: 'app_retired', name: r?.name ?? '' });
        else if (!r.priced) result.set(`app:${id}`, { code: 'app_no_price', name: r.name });
      }
    }
    if (features.length) {
      const { rows } = await c.query<{ key: string }>(
        `SELECT key FROM commercial.feature_key WHERE key = ANY($1::text[]) AND retired_at IS NULL`,
        [features],
      );
      const live = new Set(rows.map((r) => r.key));
      for (const k of features) {
        if (!live.has(k)) result.set(`feature:${k}`, { code: 'feature_retired', name: k });
      }
    }
    if (addons.length) {
      const { rows } = await c.query<{
        code: string;
        name: string;
        stopped: boolean;
        priced: boolean;
      }>(
        `SELECT a.code, a.name, a.sales_stopped_at IS NOT NULL AS stopped,
                EXISTS (SELECT 1 FROM commercial.addon_price p WHERE p.addon_id = a.id) AS priced
           FROM commercial.addon a WHERE a.code = ANY($1::text[])`,
        [addons],
      );
      const found = new Map(rows.map((r) => [r.code, r]));
      for (const code of addons) {
        const r = found.get(code);
        if (!r) result.set(`addon:${code}`, { code: 'addon_missing', name: '' });
        else if (r.stopped)
          result.set(`addon:${code}`, { code: 'addon_sales_stopped', name: r.name });
        else if (!r.priced) result.set(`addon:${code}`, { code: 'addon_no_price', name: r.name });
      }
    }
    if (plans.length) {
      const { rows } = await c.query<{
        id: string;
        name: string;
        on_sale: boolean;
        priced: boolean;
      }>(
        `SELECT v.id, p.name,
                (v.published_at IS NOT NULL AND p.sales_stopped_at IS NULL
                 AND (v.available_from IS NULL OR v.available_from <= current_date)
                 AND (v.available_until IS NULL OR v.available_until >= current_date)) AS on_sale,
                EXISTS (SELECT 1 FROM commercial.plan_version_price x
                         WHERE x.plan_version_id = v.id) AS priced
           FROM commercial.plan_version v JOIN commercial.plan p ON p.id = v.plan_id
          WHERE v.id = ANY($1::uuid[])`,
        [plans],
      );
      const found = new Map(rows.map((r) => [r.id, r]));
      for (const id of plans) {
        const r = found.get(id);
        if (!r) result.set(`plan:${id}`, { code: 'plan_missing', name: '' });
        else if (!r.on_sale) result.set(`plan:${id}`, { code: 'plan_not_on_sale', name: r.name });
        else if (!r.priced) result.set(`plan:${id}`, { code: 'plan_no_price', name: r.name });
      }
    }
  });
  // an id that is not a UUID cannot be in the catalog
  for (const id of ids('plan:')) {
    if (!plans.includes(id)) result.set(`plan:${id}`, { code: 'plan_missing', name: '' });
  }
  return result;
}
