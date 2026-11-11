import { authorize, checkRolePermission } from '@ventora/access';
import type { TenantContext } from '@ventora/access';
import {
  archiveFormQuestionInOrg,
  createFormQuestionInOrg,
  getAppointmentAnswersInOrg,
  listFormQuestionsInOrg,
  reorderFormQuestionsInOrg,
  saveAppointmentAnswersInOrg,
  updateFormQuestionInOrg,
  type AppointmentAnswer,
  type FormAnswerValue,
  type FormQuestion,
  type FormQuestionKind,
} from '../server/forms';

/*
 * Lot B.12 — the public contract of the questions at booking (design BookingCustomForms, S127). The
 * questions: read with booking:read, configured with booking:settings. The answers of a booking:
 * read with booking:read; given from the Hub with booking:write (a member without booking:admin only
 * on their own bookings), only for the questions shown in the Hub. The public page gets the questions
 * with getPublicBookingPage and sends the answers with startPublicBooking.
 *
 * Errors: InvalidInput (label: required | too_long; kind; options: too_few | invalid; helpText;
 * serviceIds: invalid | too_many; required; inHub; sortOrder; questionIds; answers: invalid |
 * invalid:<questionId> | required:<questionId>); ResourceNotFound; Forbidden; AppNotEnabled.
 */

type Session = { sessionToken: string };

const auth = (params: Session, permission: string): Promise<TenantContext> =>
  authorize({ sessionToken: params.sessionToken, applicationId: 'booking', permission });

export type FormQuestionFields = {
  label: string;
  kind: FormQuestionKind;
  options?: string[] | null;
  helpText?: string | null;
  /** Empty or null = „Toate serviciile”. */
  serviceIds?: string[] | null;
  required?: boolean;
  inHub?: boolean;
  sortOrder?: number;
};
export type ListFormQuestionsParams = Session & { includeArchived?: boolean };
export type CreateFormQuestionParams = Session & FormQuestionFields;
export type UpdateFormQuestionParams = Session & FormQuestionFields & { questionId: string };
export type FormQuestionIdParams = Session & { questionId: string };
export type ReorderFormQuestionsParams = Session & { questionIds: string[] };
export type AppointmentAnswersParams = Session & { appointmentId: string };
export type SaveAppointmentAnswersParams = Session & {
  appointmentId: string;
  answers: Array<{ questionId: string; value: FormAnswerValue | null }>;
};

export async function listFormQuestions(params: ListFormQuestionsParams): Promise<FormQuestion[]> {
  return listFormQuestionsInOrg(
    await auth(params, 'booking:read'),
    params.includeArchived === true,
  );
}

export async function createFormQuestion(params: CreateFormQuestionParams): Promise<FormQuestion> {
  return createFormQuestionInOrg(await auth(params, 'booking:settings'), params);
}

export async function updateFormQuestion(params: UpdateFormQuestionParams): Promise<FormQuestion> {
  return updateFormQuestionInOrg(await auth(params, 'booking:settings'), params.questionId, params);
}

/** „Șterge întrebarea”: archived; the answers already given stay on their bookings. */
export async function archiveFormQuestion(params: FormQuestionIdParams): Promise<FormQuestion> {
  return archiveFormQuestionInOrg(await auth(params, 'booking:settings'), params.questionId);
}

/** The new order of every active question. */
export async function reorderFormQuestions(
  params: ReorderFormQuestionsParams,
): Promise<FormQuestion[]> {
  return reorderFormQuestionsInOrg(await auth(params, 'booking:settings'), params.questionIds);
}

/** „Răspunsuri la întrebări” on the booking; value null = „Fără răspuns”. */
export async function getAppointmentAnswers(
  params: AppointmentAnswersParams,
): Promise<AppointmentAnswer[]> {
  return getAppointmentAnswersInOrg(await auth(params, 'booking:read'), params.appointmentId);
}

/** The team's answers from the Hub (the questions marked „Apare și … din Hub”). */
export async function saveAppointmentAnswers(
  params: SaveAppointmentAnswersParams,
): Promise<AppointmentAnswer[]> {
  const ctx = await auth(params, 'booking:write');
  const all =
    ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'booking', 'booking:admin'));
  return saveAppointmentAnswersInOrg(
    ctx,
    all ? 'all' : 'own',
    params.appointmentId,
    params.answers,
  );
}

export type { AppointmentAnswer, FormAnswerValue, FormQuestion, FormQuestionKind };
