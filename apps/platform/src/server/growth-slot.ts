import { getLocale } from 'next-intl/server';
import { GROWTH_LOCALES, type GrowthLocale, type GrowthOfferCost } from '@ventora/contracts';
import { getSlotContent, type GrowthRole } from '@ventora/growth';
import type { AppName } from '@ventora/ui';

/*
 * Lotul 5.9a — ce trimite un slot Growth către ecran. Se apelează doar din server (din citirea
 * paginii), cu persoana și afacerea din authorize(), niciodată din client. Gol = null: ecranul nu
 * desenează nimic (§8.7). Fără id-urile campaniei / ofertei: clientul primește doar `contentId`
 * (afișarea), cu care raportează ce a făcut persoana.
 */

export interface GrowthSlotView {
  slotId: string;
  /** Afișarea; cheia interacțiunilor („Nu mă interesează”, „Amintește-mi”, „Anulează”). */
  contentId: string;
  /** false: cerută de persoană (catalogul): fără „Nu mă interesează” și fără „Amintește-mi”. */
  proactive: boolean;
  /** member: doar „Recomandă aplicația”, niciodată o ofertă de cumpărare (P21). */
  audience: 'buyer' | 'member';
  title: string;
  body: string;
  /** Aplicația spre care trimite oferta (activare sau probă), dacă e una. */
  app: AppName | null;
  kind: 'app_activation' | 'plan_upgrade' | 'addon' | 'trial' | 'bundle';
  /** Pachetul în plus spre care trimite oferta (`addon`). */
  addonCode: string | null;
  cost: GrowthOfferCost;
}

export interface GrowthSubject {
  organizationId: string;
  userId: string;
  role: string;
}

/** Rolurile Hub care decid (ADR-0004); oricine altcineva e „member” pentru Growth. */
export const growthRole = (role: string): GrowthRole =>
  role === 'owner' || role === 'admin' ? role : 'member';

const asLocale = (l: string): GrowthLocale =>
  (GROWTH_LOCALES as readonly string[]).includes(l) ? (l as GrowthLocale) : 'ro';

/** Ce arată slotul acum persoanei, sau null. Nu aruncă niciodată (Growth oprit = pagina identică). */
export async function readGrowthSlot(
  who: GrowthSubject,
  slotId: string,
  opts: { userInitiated?: boolean } = {},
): Promise<GrowthSlotView | null> {
  try {
    const content = await getSlotContent({
      organizationId: who.organizationId,
      userId: who.userId,
      role: growthRole(who.role),
      locale: asLocale(await getLocale()),
      slotId,
      userInitiated: opts.userInitiated ?? false,
    });
    if (!content) return null;
    const t = content.target;
    const app =
      t.type === 'app_activation' || (t.type === 'trial' && t.applicationId)
        ? ((t.type === 'app_activation' ? t.applicationId : t.applicationId) as AppName)
        : null;
    return {
      slotId: content.slotId,
      contentId: content.contentId,
      proactive: content.proactive,
      audience: content.audience,
      title: content.title,
      body: content.body,
      app,
      kind: t.type,
      addonCode: t.type === 'addon' ? t.addonCode : null,
      cost: content.cost,
    };
  } catch {
    return null;
  }
}
