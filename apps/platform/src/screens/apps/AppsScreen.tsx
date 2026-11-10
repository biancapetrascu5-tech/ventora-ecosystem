'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APPS } from '@ventora/ui';
import { useIsPhone } from '@ventora/screens';
import type { AppsData } from '@/server/catalog-actions';
import { growthInteraction } from '@/server/growth-actions';
import { useCostLine } from '../growth/GrowthRecommendation';
import { useMoney } from '../plan/format';
import { AppsView, type AppsGroup } from './AppsView';
import { APP_GROUPS } from './content';

/* Lotul 3.7 — HubCatalog din datele afacerii: deținute („în abonament”, se deschid) și celelalte
   (descrierea și mentenanța în moneda afacerii, „Vezi detaliile” → HubCatalogApp; fără preț în
   moneda afacerii: „Scrie-ne” → Suport). Lotul 5.9a: slotul Growth `hub.catalog.apps`
   (CatalogRecommendation) pune eticheta „Recomandare”, motivul și costul pe AppTile-ul aplicației
   recomandate, doar dacă afacerea n-o are; e cerut de persoană, deci fără „Nu mă interesează”.
   Costul îl vede doar cine decide (owner); „Vezi detaliile” deschide pagina aplicației. */

export function AppsScreen({ data }: { data: AppsData }) {
  const router = useRouter();
  const phone = useIsPhone();
  const t = useTranslations('hub.apps');
  const catalog = useTranslations('catalog');
  const ui = useTranslations('ui');
  const money = useMoney(data.currency);
  const reco = data.recommendation;
  const recoCost = useCostLine(reco);
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const byId = new Map(data.applications.map((a) => [a.id, a]));
  const q = query.trim().toLocaleLowerCase();
  const all = APP_GROUPS.flatMap(([, apps]) => apps);
  const ownedCount = all.filter((a) => byId.get(a)?.active).length;

  const groups: AppsGroup[] = APP_GROUPS.map(([id, apps]) => ({
    id,
    title: t(`group.${id}`),
    tiles: apps
      .map((app) => {
        const entry = byId.get(app);
        const desc = t(`desc.${app}`);
        const owned = !!entry?.active;
        const priced = entry && entry.monthMinor !== null;
        return {
          app,
          owned,
          match: `${APPS[app]?.name ?? app} ${desc}`.toLocaleLowerCase(),
          description: owned ? `${desc} · ${t('inPlan')}` : undefined,
          reason: owned
            ? undefined
            : priced
              ? `${desc}. ${catalog('bundles.price', { amount: money.minor(entry.monthMinor ?? 0) })}`
              : `${desc}.`,
          onOpen: owned ? () => router.push(`/applications/${app}`) : undefined,
          recommendation:
            !owned && reco?.app === app
              ? { reason: reco.body, ...(data.owner && recoCost ? { cost: recoCost } : {}) }
              : undefined,
          onDetails:
            !owned && (priced || reco?.app === app)
              ? () => {
                  if (reco?.app === app) {
                    void growthInteraction({
                      contentId: reco.contentId,
                      kind: 'click',
                      key: crypto.randomUUID(),
                    });
                  }
                  router.push(`/applications/${app}`);
                }
              : undefined,
          onWriteUs: !owned && !priced ? () => router.push('/support') : undefined,
        };
      })
      .filter((a) => (!onlyMissing || !a.owned) && (!q || a.match.includes(q)))
      .map(({ match: _match, ...tile }) => tile),
  }));
  const none = groups.every((g) => g.tiles.length === 0);

  return (
    <AppsView
      phone={phone}
      lead={t('lead', { total: all.length, have: ownedCount })}
      query={query}
      onQuery={setQuery}
      onlyMissing={onlyMissing}
      onOnlyMissing={setOnlyMissing}
      groups={groups}
      empty={none && q ? ui('noResultsFor', { q: query.trim() }) : undefined}
    />
  );
}
