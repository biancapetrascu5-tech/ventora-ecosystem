import { AuditActions, appendAuditEventInTx, prismaTxExecutor } from '@ventora/audit';
import { InvalidInput } from '@ventora/errors';
import { getOrgDb } from './db';
import type { OrgContext } from './contract';
import { ForbiddenError } from './errors';

/*
 * Brand Kit (S148; approved by the founder on 14.11.2026): the business's look — the logo on a
 * light background and the optional one on a dark background (core/files ids), the main and the
 * accent colour, the font, the tone and the e-mail signature. Empty = the Ventora Systems look.
 *
 *   getOrganizationBrand   → the team (HubBrand, the account menu) and the jobs that write to the
 *                            business's clients (EasyBook, CampaignKit): everything, the signature
 *                            too, read in the business's own context (RLS);
 *   saveOrganizationBrand  → owner / admin; one audit row with only the names of the changed
 *                            fields (never the signature); returns the logos it replaced, which
 *                            the caller deletes through core/files (the system deletion);
 *   resetOrganizationBrand → „Revino la aspectul Ventora”: an UPDATE that empties the fields (no
 *                            DELETE), audited;
 *   findPublicBrand        → the public page, no session: only the logos, colours, font, tone of an
 *                            ACTIVE business (find_public_brand), never the signature;
 *   findBrandLogo          → /brand/logo/<id>: the business, only for the CURRENT logo of an ACTIVE
 *                            business (a replaced, emptied or suspended one → null → 404);
 *   listMyMembershipBrands → the business switcher: the logos of the person's businesses.
 *
 * The caller checks that a logo id is a ready file of this business, owner `organizations` /
 * `brand_logo` (the @ventora/files contract): this module reads no other schema.
 */

export const BRAND_FONTS = ['modern', 'expressive', 'classic', 'rounded'] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];
export const BRAND_TONES = ['formal', 'friendly', 'short'] as const;
export type BrandTone = (typeof BRAND_TONES)[number];
export const BRAND_SIGNATURE_MAX = 300;

export interface OrganizationBrand {
  logoLightFileId: string | null;
  logoDarkFileId: string | null;
  /** `#rrggbb`, lower case; null = the Ventora colour. */
  primaryColor: string | null;
  accentColor: string | null;
  /** null = Modern. */
  font: BrandFont | null;
  tone: BrandTone;
  emailSignature: string | null;
  /** null when the business never saved a brand. */
  updatedAt: string | null;
}

/** What the public page may show (no signature). */
export type PublicBrand = Omit<OrganizationBrand, 'emailSignature' | 'updatedAt'>;

export type BrandPatch = Partial<Omit<OrganizationBrand, 'updatedAt'>>;

export const EMPTY_BRAND: OrganizationBrand = {
  logoLightFileId: null,
  logoDarkFileId: null,
  primaryColor: null,
  accentColor: null,
  font: null,
  tone: 'formal',
  emailSignature: null,
  updatedAt: null,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#[0-9a-f]{6}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type BrandRow = {
  logo_light_file_id: string | null;
  logo_dark_file_id: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font: BrandFont | null;
  tone: BrandTone;
  email_signature: string | null;
  updated_at: Date;
};

const toBrand = (r: BrandRow): OrganizationBrand => ({
  logoLightFileId: r.logo_light_file_id,
  logoDarkFileId: r.logo_dark_file_id,
  primaryColor: r.primary_color,
  accentColor: r.accent_color,
  font: r.font,
  tone: r.tone,
  emailSignature: r.email_signature,
  updatedAt: r.updated_at.toISOString(),
});

function manager(ctx: OrgContext): void {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ForbiddenError();
}

async function inOrg<T>(organizationId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getOrgDb().$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

function cleanFileId(field: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new InvalidInput(field);
  return value.toLowerCase();
}

function cleanColor(field: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput(field);
  const v = value.trim().toLowerCase();
  if (!COLOR_RE.test(v)) throw new InvalidInput(field, `${field}:invalid`);
  return v;
}

/**
 * The e-mail signature: plain text, at most 300 characters, no links and no markup (the e-mails
 * escape it anyway; a link in a signature is a phishing risk the design does not allow).
 */
export function cleanSignature(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidInput('emailSignature');
  // eslint-disable-next-line no-control-regex
  const v = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .trim();
  if (v.length === 0) return null;
  if (v.length > BRAND_SIGNATURE_MAX)
    throw new InvalidInput('emailSignature', 'emailSignature:tooLong');
  if (/[<>]|https?:|www\.|\b[a-z0-9-]+\.(?:ro|com|net|org|eu|io)\b/i.test(v)) {
    throw new InvalidInput('emailSignature', 'emailSignature:link');
  }
  return v;
}

function cleanPatch(patch: BrandPatch): Record<string, unknown> {
  if (!patch || typeof patch !== 'object') throw new InvalidInput('brand');
  const out: Record<string, unknown> = {};
  if ('logoLightFileId' in patch)
    out.logo_light_file_id = cleanFileId('logoLightFileId', patch.logoLightFileId);
  if ('logoDarkFileId' in patch)
    out.logo_dark_file_id = cleanFileId('logoDarkFileId', patch.logoDarkFileId);
  if ('primaryColor' in patch) out.primary_color = cleanColor('primaryColor', patch.primaryColor);
  if ('accentColor' in patch) out.accent_color = cleanColor('accentColor', patch.accentColor);
  if ('font' in patch) {
    if (patch.font !== null && !(BRAND_FONTS as readonly unknown[]).includes(patch.font)) {
      throw new InvalidInput('font');
    }
    out.font = patch.font ?? null;
  }
  if ('tone' in patch) {
    if (!(BRAND_TONES as readonly unknown[]).includes(patch.tone)) throw new InvalidInput('tone');
    out.tone = patch.tone;
  }
  if ('emailSignature' in patch) out.email_signature = cleanSignature(patch.emailSignature);
  return out;
}

const SELECT = `SELECT logo_light_file_id::text, logo_dark_file_id::text, primary_color, accent_color,
  font, tone, email_signature, updated_at FROM organizations.organization_brand`;

/** The business's brand; the Ventora look (EMPTY_BRAND) when it never saved one. */
export async function getOrganizationBrand(organizationId: string): Promise<OrganizationBrand> {
  if (!UUID_RE.test(organizationId ?? '')) throw new InvalidInput('organizationId');
  const rows = (await inOrg(organizationId, (tx) =>
    tx.$queryRawUnsafe(`${SELECT} WHERE organization_id = $1::uuid`, organizationId),
  )) as BrandRow[];
  return rows[0] ? toBrand(rows[0]) : { ...EMPTY_BRAND };
}

/** The changed brand and the logos it replaced (the caller deletes them through core/files). */
export async function saveOrganizationBrand(
  ctx: OrgContext,
  patch: BrandPatch,
): Promise<{ brand: OrganizationBrand; replacedLogoIds: string[] }> {
  manager(ctx);
  const values = cleanPatch(patch);
  const fields = Object.keys(values);
  if (fields.length === 0) {
    return { brand: await getOrganizationBrand(ctx.organizationId), replacedLogoIds: [] };
  }
  return inOrg(ctx.organizationId, async (tx) => {
    const before = (
      (await tx.$queryRawUnsafe(
        `${SELECT} WHERE organization_id = $1::uuid FOR UPDATE`,
        ctx.organizationId,
      )) as BrandRow[]
    )[0];
    const current = before ? toBrand(before) : EMPTY_BRAND;
    const next = {
      logo_light_file_id: current.logoLightFileId,
      logo_dark_file_id: current.logoDarkFileId,
      primary_color: current.primaryColor,
      accent_color: current.accentColor,
      font: current.font,
      tone: current.tone,
      email_signature: current.emailSignature,
      ...values,
    } as Omit<BrandRow, 'updated_at'>;
    // a dark logo needs the light one (the CHECK repeats it): emptying the light one empties both
    if (next.logo_light_file_id === null) next.logo_dark_file_id = null;
    const rows = (await tx.$queryRawUnsafe(
      `INSERT INTO organizations.organization_brand
         (organization_id, logo_light_file_id, logo_dark_file_id, primary_color, accent_color,
          font, tone, email_signature, updated_at, updated_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, now(), $9::uuid)
       ON CONFLICT (organization_id) DO UPDATE SET
         logo_light_file_id = EXCLUDED.logo_light_file_id,
         logo_dark_file_id = EXCLUDED.logo_dark_file_id,
         primary_color = EXCLUDED.primary_color,
         accent_color = EXCLUDED.accent_color,
         font = EXCLUDED.font,
         tone = EXCLUDED.tone,
         email_signature = EXCLUDED.email_signature,
         updated_at = now(),
         updated_by_user_id = EXCLUDED.updated_by_user_id
       RETURNING logo_light_file_id::text, logo_dark_file_id::text, primary_color, accent_color,
         font, tone, email_signature, updated_at`,
      ctx.organizationId,
      next.logo_light_file_id,
      next.logo_dark_file_id,
      next.primary_color,
      next.accent_color,
      next.font,
      next.tone,
      next.email_signature,
      ctx.userId,
    )) as BrandRow[];
    const brand = toBrand(rows[0]!);
    const replacedLogoIds = [current.logoLightFileId, current.logoDarkFileId].filter(
      (id): id is string =>
        id !== null && id !== brand.logoLightFileId && id !== brand.logoDarkFileId,
    );
    await appendAuditEventInTx(prismaTxExecutor(tx), {
      category: 'organization',
      action: AuditActions.organizationBrandUpdated,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'organization',
      targetId: ctx.organizationId,
      // only the names: never the signature, the colours are not personal but stay out too
      metadata: { fields: fields.sort() },
    });
    return { brand, replacedLogoIds };
  });
}

/** „Revino la aspectul Ventora”: the fields emptied (no DELETE); the logos it dropped. */
export async function resetOrganizationBrand(
  ctx: OrgContext,
): Promise<{ replacedLogoIds: string[] }> {
  manager(ctx);
  return inOrg(ctx.organizationId, async (tx) => {
    const rows = (await tx.$queryRawUnsafe(
      `UPDATE organizations.organization_brand b SET
         logo_light_file_id = NULL, logo_dark_file_id = NULL, primary_color = NULL,
         accent_color = NULL, font = NULL, tone = 'formal', email_signature = NULL,
         updated_at = now(), updated_by_user_id = $2::uuid
        FROM (SELECT organization_id, logo_light_file_id, logo_dark_file_id
                FROM organizations.organization_brand WHERE organization_id = $1::uuid FOR UPDATE) old
       WHERE b.organization_id = old.organization_id
       RETURNING old.logo_light_file_id::text AS light, old.logo_dark_file_id::text AS dark`,
      ctx.organizationId,
      ctx.userId,
    )) as Array<{ light: string | null; dark: string | null }>;
    if (!rows[0]) return { replacedLogoIds: [] };
    await appendAuditEventInTx(prismaTxExecutor(tx), {
      category: 'organization',
      action: AuditActions.organizationBrandReset,
      outcome: 'success',
      actorType: 'user',
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      targetType: 'organization',
      targetId: ctx.organizationId,
      metadata: {},
    });
    return {
      replacedLogoIds: [rows[0].light, rows[0].dark].filter((id): id is string => id !== null),
    };
  });
}

/** The public page of an active business, without a session: only the look, never the signature. */
export async function findPublicBrand(slug: unknown): Promise<PublicBrand | null> {
  if (typeof slug !== 'string') return null;
  const s = slug.trim().toLowerCase();
  if (!SLUG_RE.test(s)) return null;
  const rows = (await getOrgDb().$queryRaw`
    SELECT logo_light_file_id::text, logo_dark_file_id::text, primary_color, accent_color, font, tone
      FROM organizations.find_public_brand(${s})`) as Array<
    Omit<BrandRow, 'email_signature' | 'updated_at'>
  >;
  const r = rows[0];
  return r
    ? {
        logoLightFileId: r.logo_light_file_id,
        logoDarkFileId: r.logo_dark_file_id,
        primaryColor: r.primary_color,
        accentColor: r.accent_color,
        font: r.font,
        tone: r.tone,
      }
    : null;
}

/** /brand/logo/<id>: the business, only for the current logo of an active business; else null. */
export async function findBrandLogo(fileId: unknown): Promise<string | null> {
  if (typeof fileId !== 'string' || !UUID_RE.test(fileId)) return null;
  const rows = (await getOrgDb().$queryRaw`
    SELECT organization_id::text FROM organizations.find_brand_logo(${fileId}::uuid)`) as Array<{
    organization_id: string;
  }>;
  return rows[0]?.organization_id ?? null;
}

/** The business switcher: the logos of the businesses the person (from the session) is in. */
export async function listMyMembershipBrands(
  userId: string,
): Promise<
  Array<{ organizationId: string; logoLightFileId: string | null; logoDarkFileId: string | null }>
> {
  if (!UUID_RE.test(userId ?? '')) throw new InvalidInput('userId');
  const rows = (await getOrgDb().$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return tx.$queryRaw`SELECT organization_id::text, logo_light_file_id::text, logo_dark_file_id::text
      FROM organizations.list_my_membership_brands()`;
  })) as Array<{
    organization_id: string;
    logo_light_file_id: string | null;
    logo_dark_file_id: string | null;
  }>;
  return rows.map((r) => ({
    organizationId: r.organization_id,
    logoLightFileId: r.logo_light_file_id,
    logoDarkFileId: r.logo_dark_file_id,
  }));
}
