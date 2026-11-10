import { authorize } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  archiveMedicalFieldInOrg,
  createMedicalFieldInOrg,
  getMedicalAnswersInOrg,
  listMedicalFieldsInOrg,
  recordMedicalConsentInOrg,
  saveMedicalAnswersInOrg,
  updateMedicalFieldInOrg,
  withdrawMedicalConsentInOrg,
  type MedicalAnswers,
  type MedicalConsent,
  type MedicalField,
  type MedicalFieldKind,
} from '../server/medical';

/*
 * Lot B.8 — the public contract of the health fields (D-B-14; design BookingHealthFields). Only on
 * the businesses marked medical (feature booking.medical, else FeatureNotIncluded). The fields: read
 * with booking:read, configured with booking:settings. The consent and the answers: booking:medical
 * (owner, admin, application manager; T3). Every read of the answers is logged.
 *
 * Errors: InvalidInput (label, kind, options, serviceIds, required, sortOrder, textVersion, answers);
 * Conflict (medical_consent_required, client_erased, client_merged); FeatureNotIncluded;
 * ResourceNotFound; Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

const auth = (params: Session, permission: string): Promise<TenantContext> =>
  authorize({ sessionToken: params.sessionToken, applicationId: 'booking', permission });

export type MedicalFieldFields = {
  label: string;
  kind: MedicalFieldKind;
  options?: string[] | null;
  serviceIds?: string[] | null;
  required?: boolean;
  sortOrder?: number;
};
export type ListMedicalFieldsParams = Session & { includeArchived?: boolean };
export type CreateMedicalFieldParams = Session & MedicalFieldFields;
export type UpdateMedicalFieldParams = Session & MedicalFieldFields & { fieldId: string };
export type MedicalFieldIdParams = Session & { fieldId: string };
export type RecordMedicalConsentParams = Session & { clientId: string; textVersion: string };
export type SaveMedicalAnswersParams = Session & {
  clientId: string;
  answers: Array<{ fieldId: string; value: string }>;
};
export type MedicalClientParams = Session & { clientId: string };

export async function listMedicalFields(params: ListMedicalFieldsParams): Promise<MedicalField[]> {
  return listMedicalFieldsInOrg(
    await auth(params, 'booking:read'),
    params.includeArchived === true,
  );
}

export async function createMedicalField(params: CreateMedicalFieldParams): Promise<MedicalField> {
  return createMedicalFieldInOrg(await auth(params, 'booking:settings'), params);
}

export async function updateMedicalField(params: UpdateMedicalFieldParams): Promise<MedicalField> {
  return updateMedicalFieldInOrg(await auth(params, 'booking:settings'), params.fieldId, params);
}

export async function archiveMedicalField(params: MedicalFieldIdParams): Promise<MedicalField> {
  return archiveMedicalFieldInOrg(await auth(params, 'booking:settings'), params.fieldId);
}

export async function recordMedicalConsent(
  params: RecordMedicalConsentParams,
): Promise<MedicalConsent> {
  return recordMedicalConsentInOrg(await auth(params, 'booking:medical'), {
    clientId: params.clientId,
    textVersion: params.textVersion,
  });
}

export async function saveMedicalAnswers(params: SaveMedicalAnswersParams): Promise<void> {
  return saveMedicalAnswersInOrg(await auth(params, 'booking:medical'), {
    clientId: params.clientId,
    answers: params.answers,
  });
}

export async function getMedicalAnswers(params: MedicalClientParams): Promise<MedicalAnswers> {
  return getMedicalAnswersInOrg(await auth(params, 'booking:medical'), params.clientId);
}

export async function withdrawMedicalConsent(params: MedicalClientParams): Promise<void> {
  return withdrawMedicalConsentInOrg(await auth(params, 'booking:medical'), params.clientId);
}
