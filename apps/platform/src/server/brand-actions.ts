'use server';

import './access-config';
import { headers } from 'next/headers';
import { authorize, PLATFORM_APPLICATION_ID } from '@ventora/access';
import { listServices } from '@ventora/booking';
import { Forbidden, InvalidInput } from '@ventora/errors';
import {
  BRAND_LOGO_OWNER,
  confirmPersonalUpload,
  confirmUpload,
  deleteFileAsSystem,
  deletePersonalFile,
  getFile,
  requestPersonalUpload,
  requestUpload,
} from '@ventora/files';
import { getSession, getUserImageFileId, setUserImage } from '@ventora/identity';
import {
  getOrganizationBrand,
  getOrganizationCard,
  resetOrganizationBrand,
  resolveOrgContext,
  saveOrganizationBrand,
  type BrandPatch,
  type OrganizationBrand,
} from '@ventora/organizations';
import { reportActionError } from './report-error';

/*
 * Brand Kit (S148, HubBrand) and the profile photo (S147, „Contul tău”). The business and the
 * person always come from the session through authorize() / getSession(), never from the client.
 * Only the owner and the admins change the brand (core/organizations refuses the rest); a logo is
 * accepted only if it is a ready file of this business with the owner `organizations` /
 * `brand_logo`; the logos a save replaces are deleted by the system deletion of core/files.
 */

export type BrandData = {
  brand: OrganizationBrand;
  /** owner or admin: may change it. */
  canEdit: boolean;
  /** The business's name (read only: „Pentru alt nume, scrie-ne.”). */
  name: string;
  /** Up to 3 bookable EasyBook services, for the preview of the booking page; [] without it. */
  services: string[];
  /** The logo addresses (`/brand/logo/<id>`), for the tiles and the preview. */
  logoLight: string | null;
  logoDark: string | null;
};

async function session() {
  const s = await getSession(await headers());
  if (!s) throw new Error('no session');
  return s;
}

async function tenant() {
  const s = await session();
  const ctx = await authorize({ sessionToken: s.token, applicationId: PLATFORM_APPLICATION_ID });
  return ctx;
}

/** null: no session, no active business or a suspended one. */
export async function readBrand(): Promise<BrandData | null> {
  try {
    const s = await session();
    const ctx = await tenant();
    const [brand, card, services] = await Promise.all([
      getOrganizationBrand(ctx.organizationId),
      getOrganizationCard(ctx.organizationId),
      // the preview never blocks the page: without EasyBook (or its right), no service rows
      listServices({ sessionToken: s.token })
        .then((list) =>
          list
            .filter((x) => !x.archivedAt && x.bookableOnline)
            .slice(0, 3)
            .map((x) => x.name),
        )
        .catch(() => [] as string[]),
    ]);
    return {
      brand,
      canEdit: ctx.role === 'owner' || ctx.role === 'admin',
      name: card?.name ?? '',
      services,
      logoLight: brand.logoLightFileId ? `/brand/logo/${brand.logoLightFileId}` : null,
      logoDark: brand.logoDarkFileId ? `/brand/logo/${brand.logoDarkFileId}` : null,
    };
  } catch (err) {
    reportActionError('readBrand', err);
    return null;
  }
}

export type UploadStart =
  | { ok: true; fileId: string; uploadUrl: string }
  | { ok: false; reason: 'type' | 'size' | 'forbidden' | 'error' };

const reasonOf = (err: unknown): 'type' | 'size' | 'error' =>
  err instanceof InvalidInput
    ? err.field === 'contentType'
      ? 'type'
      : err.field === 'sizeBytes'
        ? 'size'
        : 'error'
    : 'error';

/** The upload link for a logo (light or dark); the browser sends the bytes, then confirmLogo. */
export async function startLogoUpload(input: {
  variant: 'light' | 'dark';
  name: string;
  contentType: string;
  sizeBytes: number;
}): Promise<UploadStart> {
  try {
    const ctx = await tenant();
    if (ctx.role !== 'owner' && ctx.role !== 'admin') return { ok: false, reason: 'forbidden' };
    if (input.variant !== 'light' && input.variant !== 'dark')
      return { ok: false, reason: 'error' };
    const { fileId, uploadUrl } = await requestUpload(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        owner: { ...BRAND_LOGO_OWNER, resourceId: input.variant },
        name: input.name,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      },
    );
    return { ok: true, fileId, uploadUrl };
  } catch (err) {
    const reason = reasonOf(err);
    if (reason === 'error') reportActionError('startLogoUpload', err);
    return { ok: false, reason };
  }
}

export type LogoConfirm = { ok: true } | { ok: false; reason: 'small' | 'type' | 'error' };

/** After the upload: ready only if it is a PNG / JPEG of at least 256 px (core/files). */
export async function confirmLogo(fileId: string): Promise<LogoConfirm> {
  try {
    const ctx = await tenant();
    await confirmUpload({ organizationId: ctx.organizationId, userId: ctx.userId }, fileId);
    return { ok: true };
  } catch (err) {
    const message = (err as Error)?.message ?? '';
    if (message.includes('too_small')) return { ok: false, reason: 'small' };
    if (message.includes('type_mismatch')) return { ok: false, reason: 'type' };
    reportActionError('confirmLogo', err);
    return { ok: false, reason: 'error' };
  }
}

export type SaveBrandResult =
  | { ok: true; brand: OrganizationBrand }
  | { ok: false; reason: 'invalid' | 'forbidden' | 'error'; field?: string };

/** „Salvează”: the changed fields; the replaced logos leave core/files. */
export async function saveBrand(patch: BrandPatch): Promise<SaveBrandResult> {
  try {
    const s = await session();
    const ctx = await tenant();
    // a logo must be a ready file of this business, owner organizations / brand_logo
    for (const id of [patch.logoLightFileId, patch.logoDarkFileId]) {
      if (typeof id !== 'string') continue;
      const file = await getFile({ organizationId: ctx.organizationId, userId: ctx.userId }, id);
      if (
        file.status !== 'ready' ||
        file.owner.module !== BRAND_LOGO_OWNER.module ||
        file.owner.resourceType !== BRAND_LOGO_OWNER.resourceType
      ) {
        return { ok: false, reason: 'invalid', field: 'logo' };
      }
    }
    const org = await resolveOrgContext({ userId: s.userId, organizationId: ctx.organizationId });
    const { brand, replacedLogoIds } = await saveOrganizationBrand(org, patch);
    await dropLogos(ctx.organizationId, replacedLogoIds);
    return { ok: true, brand };
  } catch (err) {
    if (err instanceof InvalidInput) return { ok: false, reason: 'invalid', field: err.field };
    if (err instanceof Forbidden) return { ok: false, reason: 'forbidden' };
    reportActionError('saveBrand', err);
    return { ok: false, reason: 'error' };
  }
}

/** „Revino la aspectul Ventora”: the fields emptied, the logos deleted. */
export async function resetBrand(): Promise<{ ok: boolean }> {
  try {
    const s = await session();
    const ctx = await tenant();
    const org = await resolveOrgContext({ userId: s.userId, organizationId: ctx.organizationId });
    const { replacedLogoIds } = await resetOrganizationBrand(org);
    await dropLogos(ctx.organizationId, replacedLogoIds);
    return { ok: true };
  } catch (err) {
    reportActionError('resetBrand', err);
    return { ok: false };
  }
}

/** The replaced logos: deleted by the system (audited as organization); a failure is reported. */
async function dropLogos(organizationId: string, ids: string[]): Promise<void> {
  for (const fileId of ids) {
    await deleteFileAsSystem(organizationId, {
      fileId,
      module: 'organizations',
      reason: 'brand_logo_replaced',
    }).catch((err) => reportActionError('brand.dropLogo', err));
  }
}

// ── S147: the profile photo („Contul tău”) ───────────────────────────────────────────────────

export async function startPhotoUpload(input: {
  contentType: string;
  sizeBytes: number;
}): Promise<UploadStart> {
  try {
    const s = await session();
    const { fileId, uploadUrl } = await requestPersonalUpload(s.userId, {
      purpose: 'avatar',
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    return { ok: true, fileId, uploadUrl };
  } catch (err) {
    const reason = reasonOf(err);
    if (reason === 'error') reportActionError('startPhotoUpload', err);
    return { ok: false, reason };
  }
}

/** After the upload: the photo becomes the person's (users.image); the old one is deleted. */
export async function confirmPhoto(
  fileId: string,
): Promise<{ ok: true; src: string } | { ok: false; reason: 'type' | 'error' }> {
  try {
    const s = await session();
    const info = await confirmPersonalUpload(s.userId, fileId);
    await setUserImage(s.userId, info.id);
    return { ok: true, src: `/account/photo/${info.id}` };
  } catch (err) {
    if (((err as Error)?.message ?? '').includes('type_mismatch')) {
      return { ok: false, reason: 'type' };
    }
    reportActionError('confirmPhoto', err);
    return { ok: false, reason: 'error' };
  }
}

/** „Șterge poza”: no photo any more (the switcher shows nothing, the avatar the initials). */
export async function removePhoto(): Promise<{ ok: boolean }> {
  try {
    const s = await session();
    const current = await getUserImageFileId(s.userId);
    await setUserImage(s.userId, null);
    if (current) await deletePersonalFile(s.userId, current);
    return { ok: true };
  } catch (err) {
    reportActionError('removePhoto', err);
    return { ok: false };
  }
}
