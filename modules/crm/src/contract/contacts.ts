import { authorize, checkRolePermission, type TenantContext } from '@ventora/access';
import {
  assignContactInOrg,
  createContactInOrg,
  deleteContactInOrg,
  getContactInOrg,
  listContactsInOrg,
  restoreContactInOrg,
  setContactCompanyInOrg,
  setContactCustomValuesInOrg,
  updateContactInOrg,
  type Contact,
  type ContactInput,
  type ContactScope,
  type ListContactsParams,
} from '../server/contacts';
import {
  createCompanyInOrg,
  deleteCompanyInOrg,
  getCompanyInOrg,
  listCompaniesInOrg,
  restoreCompanyInOrg,
  setCompanyCustomValuesInOrg,
  updateCompanyInOrg,
  type Company,
  type CompanyInput,
} from '../server/companies';
import { lookupCompanyByCui as lookup, type AnafLookup } from '../server/anaf';
import { registerContactsQuotaResolver } from '../server/quota';
import {
  createNoteInOrg,
  deleteNoteInOrg,
  listMyMentionsInOrg,
  updateNoteInOrg,
  type Note,
  type NoteKind,
} from '../server/notes';
import {
  deleteAttachmentInOrg,
  finishAttachmentUploadInOrg,
  getAttachmentLinkInOrg,
  startAttachmentUploadInOrg,
  type Attachment,
} from '../server/attachments';
import { getTimelineInOrg, type TimelineItem } from '../server/timeline';
import {
  createDealInOrg,
  createLossReasonInOrg,
  createPipelineInOrg,
  createStageInOrg,
  deleteDealInOrg,
  deleteLossReasonInOrg,
  deletePipelineInOrg,
  deleteStageInOrg,
  getBoardInOrg,
  getDealInOrg,
  listDealsInOrg,
  listLossReasonsInOrg,
  listPipelinesInOrg,
  loseDealInOrg,
  moveDealInOrg,
  reopenDealInOrg,
  reorderStagesInOrg,
  updateDealInOrg,
  updateLossReasonInOrg,
  updatePipelineInOrg,
  updateStageInOrg,
  winDealInOrg,
  type Board,
  type Deal,
  type DealInput,
  type DealItem,
  type ListDealsParams,
  type LossReason,
  type Pipeline,
  type Stage,
} from '../server/deals';
import {
  assignLeadInOrg,
  convertLeadInOrg,
  countLeadsInOrg,
  createLeadInOrg,
  deleteLeadInOrg,
  disqualifyLeadInOrg,
  getLeadInOrg,
  listLeadsInOrg,
  reopenLeadInOrg,
  setLeadStateInOrg,
  updateLeadInOrg,
  type DisqualifyReason,
  type Lead,
  type LeadInput,
  type LeadSource,
  type LeadState,
  type ListLeadsParams,
} from '../server/leads';
import {
  createActivityInOrg,
  deleteActivityInOrg,
  getActivityInOrg,
  listActivitiesInOrg,
  setActivityDoneInOrg,
  updateActivityInOrg,
  type Activity,
  type ActivityInput,
  type ActivityKind,
  type ListActivitiesParams,
} from '../server/activities';
import { page } from '../server/validation';
import {
  checkDuplicatesInOrg,
  dismissDuplicateInOrg,
  listDuplicatesInOrg,
  mergeContactsInOrg,
  restoreDuplicateInOrg,
  type DuplicatePair,
  type DuplicateReason,
} from '../server/duplicates';
import {
  createTagInOrg,
  deleteTagInOrg,
  listTagsInOrg,
  mergeTagInOrg,
  tagContactsInOrg,
  updateTagInOrg,
  type Tag,
} from '../server/tags';
import {
  countSegmentInOrg,
  createSegmentInOrg,
  deleteSegmentInOrg,
  getSegmentInOrg,
  listSegmentsInOrg,
  setLapsedSegmentDaysInOrg,
  updateSegmentInOrg,
  type Segment,
  type SegmentRule,
} from '../server/segments';
import {
  createCustomFieldInOrg,
  deleteCustomFieldInOrg,
  listCustomFieldsInOrg,
  restoreCustomFieldInOrg,
  updateCustomFieldInOrg,
  type CustomField,
  type CustomValues,
  type FieldTarget,
} from '../server/custom-fields';

/*
 * Lot CR.2 — the public contract of the contacts and the companies (design S130). Every function
 * starts with authorize() (application crm): reading with crm:read, writing with crm:write. The
 * organization comes only from the session; an id of another business answers ResourceNotFound
 * (T1). Who sees what (D-CRM-15 = a): with crm:admin every contact, otherwise the own and the
 * unassigned ones (scope 'own').
 *
 * Errors: InvalidInput(field, reason); Conflict (contact_deleted, contact_not_deleted,
 * easybook_read_only, easybook_contact, bin_expired, company_deleted, company_not_deleted,
 * company_has_contacts, company_tax_id_taken); Forbidden; ResourceNotFound; QuotaExceeded
 * (crm.contacts); AppNotEnabled.
 */

registerContactsQuotaResolver();

type Session = { sessionToken: string };

async function access(
  params: Session,
  permission: 'crm:read' | 'crm:write' | 'crm:settings' | 'crm:admin',
): Promise<{ ctx: TenantContext; scope: ContactScope }> {
  const ctx = await authorize({
    sessionToken: params.sessionToken,
    applicationId: 'crm',
    permission,
  });
  const all = ctx.role !== 'support' && (await checkRolePermission(ctx.role, 'crm', 'crm:admin'));
  return { ctx, scope: all ? 'all' : 'own' };
}

export type CreateContactParams = Session &
  ContactInput & {
    /** 'manual' (default), 'referral' or 'event'. */
    source?: unknown;
    /** The creator by default; null = „Neatribuit”. A member: only themselves or nobody. */
    ownerUserId?: unknown;
    companyId?: unknown;
    companyRole?: unknown;
    isCompanyPrimary?: unknown;
    /** CR.3: { fieldId: value }; the required contact fields must be there (S132). */
    customValues?: unknown;
  };

/** „Contact nou”: takes one unit of crm.contacts (QuotaExceeded at the limit, S130). */
export async function createContact(params: CreateContactParams): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createContactInOrg(ctx, scope, params);
}

export async function updateContact(
  params: Session & ContactInput & { contactId: string },
): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateContactInOrg(ctx, scope, params.contactId, params);
}

/** „Responsabil” / „Ia contactul” (a member takes an unassigned contact). */
export async function assignContact(
  params: Session & { contactId: string; ownerUserId: string | null },
): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return assignContactInOrg(ctx, scope, params.contactId, params.ownerUserId);
}

/** The company of the contact (one per contact, S130); null takes it out. */
export async function setContactCompany(
  params: Session & {
    contactId: string;
    companyId: string | null;
    companyRole?: unknown;
    isCompanyPrimary?: unknown;
  },
): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return setContactCompanyInOrg(ctx, scope, params.contactId, params);
}

/** „Șterge”: into the 30-day bin (never a contact from EasyBook). */
export async function deleteContact(params: Session & { contactId: string }): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteContactInOrg(ctx, scope, params.contactId);
}

export async function restoreContact(params: Session & { contactId: string }): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return restoreContactInOrg(ctx, scope, params.contactId);
}

export async function getContact(params: Session & { contactId: string }): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getContactInOrg(ctx, scope, params.contactId);
}

export async function listContacts(
  params: Session & ListContactsParams,
): Promise<{ items: Contact[]; total: number }> {
  const { ctx, scope } = await access(params, 'crm:read');
  return listContactsInOrg(ctx, scope, params);
}

// ── companies ──────────────────────────────────────────────────────────────────────────────────

export async function createCompany(
  params: Session & CompanyInput & { ownerUserId?: unknown; customValues?: unknown },
): Promise<Company> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createCompanyInOrg(ctx, scope, params);
}

export async function updateCompany(
  params: Session & CompanyInput & { companyId: string; ownerUserId?: unknown },
): Promise<Company> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateCompanyInOrg(ctx, scope, params.companyId, params);
}

export async function deleteCompany(params: Session & { companyId: string }): Promise<Company> {
  const { ctx } = await access(params, 'crm:write');
  return deleteCompanyInOrg(ctx, params.companyId);
}

export async function restoreCompany(params: Session & { companyId: string }): Promise<Company> {
  const { ctx } = await access(params, 'crm:write');
  return restoreCompanyInOrg(ctx, params.companyId);
}

export async function getCompany(params: Session & { companyId: string }): Promise<Company> {
  const { ctx } = await access(params, 'crm:read');
  return getCompanyInOrg(ctx, params.companyId);
}

export async function listCompanies(
  params: Session & { q?: unknown; deleted?: unknown; limit?: unknown; offset?: unknown },
): Promise<{ items: Company[]; total: number }> {
  const { ctx } = await access(params, 'crm:read');
  return listCompaniesInOrg(ctx, params);
}

/** „Completează din CUI” (ANAF, S130): fills the form; nothing is stored. */
export async function lookupCompanyByCui(params: Session & { taxId: string }): Promise<AnafLookup> {
  await access(params, 'crm:write');
  return lookup(params.taxId);
}

// ── CR.3: the business's own fields (S132) ─────────────────────────────────────────────────────

/** The fields, in their order (crm:read: the contact card and the list show them). */
export async function listCustomFields(
  params: Session & { includeDeleted?: boolean; target?: FieldTarget },
): Promise<CustomField[]> {
  const { ctx } = await access(params, 'crm:read');
  return listCustomFieldsInOrg(ctx, params);
}

type FieldInput = {
  name?: unknown;
  type?: unknown;
  options?: unknown;
  appliesTo?: unknown;
  isRequired?: unknown;
  showInList?: unknown;
  inImport?: unknown;
  sortOrder?: unknown;
};

/** „Câmp nou”: at most 30 active (Conflict custom_fields_limit). crm:settings. */
export async function createCustomField(params: Session & FieldInput): Promise<CustomField> {
  const { ctx } = await access(params, 'crm:settings');
  return createCustomFieldInOrg(ctx, params);
}

/** The type changes only while the field has no values (Conflict custom_field_type_locked). */
export async function updateCustomField(
  params: Session & FieldInput & { fieldId: string },
): Promise<CustomField> {
  const { ctx } = await access(params, 'crm:settings');
  return updateCustomFieldInOrg(ctx, params.fieldId, params);
}

/** Into the 30-day bin with its values. */
export async function deleteCustomField(
  params: Session & { fieldId: string },
): Promise<CustomField> {
  const { ctx } = await access(params, 'crm:settings');
  return deleteCustomFieldInOrg(ctx, params.fieldId);
}

export async function restoreCustomField(
  params: Session & { fieldId: string },
): Promise<CustomField> {
  const { ctx } = await access(params, 'crm:settings');
  return restoreCustomFieldInOrg(ctx, params.fieldId);
}

/** The own fields of a contact: { fieldId: value | null }. crm:write, the contacts rule. */
export async function setContactCustomValues(
  params: Session & { contactId: string; values: Record<string, unknown> },
): Promise<Contact> {
  const { ctx, scope } = await access(params, 'crm:write');
  return setContactCustomValuesInOrg(ctx, scope, params.contactId, params.values);
}

export async function setCompanyCustomValues(
  params: Session & { companyId: string; values: Record<string, unknown> },
): Promise<Company> {
  const { ctx } = await access(params, 'crm:write');
  return setCompanyCustomValuesInOrg(ctx, params.companyId, params.values);
}

// ── CR.4: tags and segments (S130, S132) ───────────────────────────────────────────────────────

export async function listTags(params: Session): Promise<Tag[]> {
  const { ctx } = await access(params, 'crm:read');
  return listTagsInOrg(ctx);
}

/** A tag (crm:settings, S132 „Etichete și surse”). */
export async function createTag(
  params: Session & { name?: unknown; color?: unknown },
): Promise<Tag> {
  const { ctx } = await access(params, 'crm:settings');
  return createTagInOrg(ctx, params);
}

export async function updateTag(
  params: Session & { tagId: string; name?: unknown; color?: unknown },
): Promise<Tag> {
  const { ctx } = await access(params, 'crm:settings');
  return updateTagInOrg(ctx, params.tagId, params);
}

/** „Unește cu…”: the contacts and the segment rules move to `intoTagId`. */
export async function mergeTag(
  params: Session & { tagId: string; intoTagId: string },
): Promise<Tag> {
  const { ctx } = await access(params, 'crm:settings');
  return mergeTagInOrg(ctx, params.tagId, params.intoTagId);
}

export async function deleteTag(params: Session & { tagId: string }): Promise<Tag> {
  const { ctx } = await access(params, 'crm:settings');
  return deleteTagInOrg(ctx, params.tagId);
}

/** „Etichetă” on one contact or in bulk (≤ 200): the contacts rule (D-CRM-15). */
export async function tagContacts(
  params: Session & { contactIds: string[]; add?: string[]; remove?: string[] },
): Promise<{ updated: number }> {
  const { ctx, scope } = await access(params, 'crm:write');
  return tagContactsInOrg(ctx, scope, params);
}

export async function listSegments(params: Session): Promise<Segment[]> {
  const { ctx } = await access(params, 'crm:read');
  return listSegmentsInOrg(ctx);
}

export async function getSegment(params: Session & { segmentId: string }): Promise<Segment> {
  const { ctx } = await access(params, 'crm:read');
  return getSegmentInOrg(ctx, params.segmentId);
}

/** „Se potrivesc acum: N contacte” — a saved segment or rules not saved yet. */
export async function countSegment(
  params: Session & { segmentId?: string; rules?: unknown; match?: unknown },
): Promise<{ count: number | null; available: boolean }> {
  const { ctx, scope } = await access(params, 'crm:read');
  return countSegmentInOrg(ctx, scope, params);
}

/** „Salvează ca segment” (crm:write; „Toată echipa” by default). */
export async function createSegment(
  params: Session & { name?: unknown; rules?: unknown; match?: unknown; visibility?: unknown },
): Promise<Segment> {
  const { ctx } = await access(params, 'crm:write');
  return createSegmentInOrg(ctx, params);
}

/** The author or crm:admin. */
export async function updateSegment(
  params: Session & {
    segmentId: string;
    name?: unknown;
    rules?: unknown;
    match?: unknown;
    visibility?: unknown;
  },
): Promise<Segment> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateSegmentInOrg(ctx, scope, params.segmentId, params);
}

export async function deleteSegment(params: Session & { segmentId: string }): Promise<void> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteSegmentInOrg(ctx, scope, params.segmentId);
}

/** The days of „N-au mai venit de N zile” (7–365), a business setting. */
export async function setLapsedSegmentDays(params: Session & { days: number }): Promise<number> {
  const { ctx } = await access(params, 'crm:settings');
  return setLapsedSegmentDaysInOrg(ctx, params.days);
}

// ── CR.5: duplicates and merge (S132) ──────────────────────────────────────────────────────────

/** The pairs (phone, e-mail, normalised name); a member sees only pairs of contacts they see. */
export async function listDuplicates(
  params: Session & { reason?: DuplicateReason; contactId?: string },
): Promise<DuplicatePair[]> {
  const { ctx, scope } = await access(params, 'crm:read');
  return listDuplicatesInOrg(ctx, scope, params);
}

/** The warning while adding a contact: up to 5 visible matches. */
export async function checkDuplicates(
  params: Session & { name?: unknown; phone?: unknown; email?: unknown },
): Promise<{ contactId: string; reasons: DuplicateReason[] }[]> {
  const { ctx, scope } = await access(params, 'crm:read');
  return checkDuplicatesInOrg(ctx, scope, params);
}

/** „Nu sunt duplicate” (crm:admin); returns the id to undo it. */
export async function dismissDuplicate(
  params: Session & { contactAId: string; contactBId: string },
): Promise<string> {
  const { ctx } = await access(params, 'crm:admin');
  return dismissDuplicateInOrg(ctx, params.contactAId, params.contactBId);
}

export async function restoreDuplicate(params: Session & { dismissalId: string }): Promise<void> {
  const { ctx } = await access(params, 'crm:admin');
  return restoreDuplicateInOrg(ctx, params.dismissalId);
}

/** „Îmbină” (crm:admin): `mergeId` disappears into `keepId`; `fromMerged`: the fields taken from it. */
export async function mergeContacts(
  params: Session & { keepId: string; mergeId: string; fromMerged?: string[] },
): Promise<{ keptId: string; mergedId: string }> {
  const { ctx } = await access(params, 'crm:admin');
  return mergeContactsInOrg(ctx, params);
}

// ── CR.6: notes, comments, files, the history (S130 „Un singur istoric”) ──────────────────────

/** „Notiță” / „Comentariu” on a contact or a company; mentions only people who see it. */
export async function createNote(
  params: Session & {
    subjectType: unknown;
    subjectId: unknown;
    kind?: unknown;
    body: unknown;
    mentions?: unknown;
  },
): Promise<Note> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createNoteInOrg(ctx, scope, params);
}

/** The author edits the text or the mentions. */
export async function updateNote(
  params: Session & { noteId: string; body?: unknown; mentions?: unknown },
): Promise<Note> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateNoteInOrg(ctx, scope, params.noteId, params);
}

/** The author or crm:admin; into the bin. */
export async function deleteNote(params: Session & { noteId: string }): Promise<Note> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteNoteInOrg(ctx, scope, params.noteId);
}

/** The notes that mention the caller, on records they see. */
export async function listMyMentions(
  params: Session & { limit?: unknown; offset?: unknown },
): Promise<Note[]> {
  const { ctx, scope } = await access(params, 'crm:read');
  return listMyMentionsInOrg(ctx, scope, page(params));
}

/** „Fișiere”: a signed upload URL (PNG, JPEG, PDF, ≤ 10 MB). */
export async function startAttachmentUpload(
  params: Session & {
    subjectType: unknown;
    subjectId: unknown;
    name: string;
    contentType: string;
    sizeBytes: number;
  },
): Promise<{ fileId: string; uploadUrl: string; expiresAt: Date }> {
  const { ctx, scope } = await access(params, 'crm:write');
  return startAttachmentUploadInOrg(ctx, scope, params);
}

/** After the upload: the real bytes are checked; ready or refused. */
export async function finishAttachmentUpload(
  params: Session & { fileId: string },
): Promise<Attachment> {
  const { ctx, scope } = await access(params, 'crm:write');
  return finishAttachmentUploadInOrg(ctx, scope, params.fileId);
}

/** A signed link, valid 10 minutes. */
export async function getAttachmentLink(params: Session & { fileId: string }): Promise<string> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getAttachmentLinkInOrg(ctx, scope, params.fileId);
}

/** The uploader or crm:admin. */
export async function deleteAttachment(params: Session & { fileId: string }): Promise<void> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteAttachmentInOrg(ctx, scope, params.fileId);
}

/** „Un singur istoric”: notes, comments and files, newest first. */
export async function getTimeline(
  params: Session & { subjectType: unknown; subjectId: unknown; limit?: unknown; offset?: unknown },
): Promise<{ items: TimelineItem[]; hasMore: boolean }> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getTimelineInOrg(ctx, scope, params);
}

// ── CR.7: activities, tasks, reminders, the calendar (S131) ───────────────────────────────────

/** „Activitate nouă” / „Înregistrează un apel”: optional record, owner, due day and time, reminder. */
export async function createActivity(
  params: Session &
    ActivityInput & { kind: unknown; subjectType?: unknown; subjectId?: unknown; done?: unknown },
): Promise<Activity> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createActivityInOrg(ctx, scope, params);
}

/** The owner, the creator or crm:admin. */
export async function updateActivity(
  params: Session & ActivityInput & { activityId: string },
): Promise<Activity> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateActivityInOrg(ctx, scope, params.activityId, params);
}

/** The tick („Făcut”) and its undo. */
export async function setActivityDone(
  params: Session & { activityId: string; done: boolean },
): Promise<Activity> {
  const { ctx, scope } = await access(params, 'crm:write');
  return setActivityDoneInOrg(ctx, scope, params.activityId, params.done);
}

/** Into the bin: the owner, the creator or crm:admin. */
export async function deleteActivity(params: Session & { activityId: string }): Promise<Activity> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteActivityInOrg(ctx, scope, params.activityId);
}

export async function getActivity(params: Session & { activityId: string }): Promise<Activity> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getActivityInOrg(ctx, scope, params.activityId);
}

/** „Activitățile mele” / „Toată echipa” / a member; the calendar with `timedOnly`. */
export async function listActivities(params: Session & ListActivitiesParams): Promise<Activity[]> {
  const { ctx, scope } = await access(params, 'crm:read');
  return listActivitiesInOrg(ctx, scope, params);
}

// ── CR.8: the leads (D-CRM-3, S131) ───────────────────────────────────────────────────────────

/** „Lead nou”: no unit of crm.contacts until converted. */
export async function createLead(
  params: Session & LeadInput & { ownerUserId?: unknown },
): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createLeadInOrg(ctx, scope, params);
}

export async function updateLead(params: Session & LeadInput & { leadId: string }): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateLeadInOrg(ctx, scope, params.leadId, params);
}

/** „Responsabil” / „Ia leadul”. */
export async function assignLead(
  params: Session & { leadId: string; ownerUserId: string | null },
): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:write');
  return assignLeadInOrg(ctx, scope, params.leadId, params.ownerUserId);
}

/** „Contactat” / „Calificat” / „Nou”. */
export async function setLeadState(
  params: Session & { leadId: string; state: unknown },
): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:write');
  return setLeadStateInOrg(ctx, scope, params.leadId, params.state);
}

export async function disqualifyLead(
  params: Session & { leadId: string; reason: unknown; note?: unknown },
): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:write');
  return disqualifyLeadInOrg(ctx, scope, params.leadId, params);
}

/** „Redeschide leadul”. */
export async function reopenLead(params: Session & { leadId: string }): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:write');
  return reopenLeadInOrg(ctx, scope, params.leadId);
}

/** „Convertește”: a new contact (QuotaExceeded at the limit) or the existing `contactId`. */
export async function convertLead(
  params: Session & {
    leadId: string;
    contactId?: unknown;
    name?: unknown;
    phone?: unknown;
    email?: unknown;
    /** CR.9: „Creează și un deal”. */
    deal?: { title?: unknown; pipelineId?: unknown; stageId?: unknown } | null;
  },
): Promise<{ lead: Lead; contact: { id: string; created: boolean }; dealId: string | null }> {
  const { ctx, scope } = await access(params, 'crm:write');
  return convertLeadInOrg(ctx, scope, params.leadId, params);
}

export async function deleteLead(params: Session & { leadId: string }): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteLeadInOrg(ctx, scope, params.leadId);
}

export async function getLead(params: Session & { leadId: string }): Promise<Lead> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getLeadInOrg(ctx, scope, params.leadId);
}

export async function listLeads(params: Session & ListLeadsParams): Promise<Lead[]> {
  const { ctx, scope } = await access(params, 'crm:read');
  return listLeadsInOrg(ctx, scope, params);
}

export async function countLeads(
  params: Session & Omit<ListLeadsParams, 'tab' | 'limit' | 'offset'>,
): Promise<{ open: number; qualified: number; closed: number }> {
  const { ctx, scope } = await access(params, 'crm:read');
  return countLeadsInOrg(ctx, scope, params);
}

// ── CR.9: pipelines, stages, loss reasons (crm:settings) and deals (S131) ─────────────────────

/** The pipelines with their stages; the default one is created at the first read. */
export async function listPipelines(params: Session): Promise<Pipeline[]> {
  const { ctx } = await access(params, 'crm:read');
  return listPipelinesInOrg(ctx);
}

/** „Pipeline nou”: one unit of crm.pipelines (QuotaExceeded at the plan's limit). */
export async function createPipeline(
  params: Session & { name: unknown; stages?: unknown },
): Promise<Pipeline> {
  const { ctx } = await access(params, 'crm:settings');
  return createPipelineInOrg(ctx, params);
}

export async function updatePipeline(
  params: Session & { pipelineId: string; name?: unknown; isDefault?: unknown },
): Promise<Pipeline> {
  const { ctx } = await access(params, 'crm:settings');
  return updatePipelineInOrg(ctx, params.pipelineId, params);
}

export async function deletePipeline(params: Session & { pipelineId: string }): Promise<void> {
  const { ctx } = await access(params, 'crm:settings');
  return deletePipelineInOrg(ctx, params.pipelineId);
}

export async function createStage(
  params: Session & { pipelineId: string; name: unknown; probability?: unknown },
): Promise<Stage> {
  const { ctx } = await access(params, 'crm:settings');
  return createStageInOrg(ctx, params.pipelineId, params);
}

export async function updateStage(
  params: Session & { stageId: string; name?: unknown; probability?: unknown },
): Promise<Stage> {
  const { ctx } = await access(params, 'crm:settings');
  return updateStageInOrg(ctx, params.stageId, params);
}

export async function reorderStages(
  params: Session & { pipelineId: string; stageIds: unknown },
): Promise<Stage[]> {
  const { ctx } = await access(params, 'crm:settings');
  return reorderStagesInOrg(ctx, params.pipelineId, params.stageIds);
}

export async function deleteStage(params: Session & { stageId: string }): Promise<void> {
  const { ctx } = await access(params, 'crm:settings');
  return deleteStageInOrg(ctx, params.stageId);
}

export async function listLossReasons(params: Session): Promise<LossReason[]> {
  const { ctx } = await access(params, 'crm:read');
  return listLossReasonsInOrg(ctx);
}

export async function createLossReason(params: Session & { label: unknown }): Promise<LossReason> {
  const { ctx } = await access(params, 'crm:settings');
  return createLossReasonInOrg(ctx, params);
}

export async function updateLossReason(
  params: Session & { lossReasonId: string; label: unknown },
): Promise<LossReason> {
  const { ctx } = await access(params, 'crm:settings');
  return updateLossReasonInOrg(ctx, params.lossReasonId, params);
}

export async function deleteLossReason(params: Session & { lossReasonId: string }): Promise<void> {
  const { ctx } = await access(params, 'crm:settings');
  return deleteLossReasonInOrg(ctx, params.lossReasonId);
}

/** „Deal nou”. */
export async function createDeal(
  params: Session &
    DealInput & {
      pipelineId?: unknown;
      stageId?: unknown;
      ownerUserId?: unknown;
      leadId?: unknown;
    },
): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:write');
  return createDealInOrg(ctx, scope, params);
}

export async function updateDeal(
  params: Session & DealInput & { dealId: string; ownerUserId?: unknown },
): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:write');
  return updateDealInOrg(ctx, scope, params.dealId, params);
}

/** The kanban move; the probability follows the stage. */
export async function moveDeal(
  params: Session & { dealId: string; stageId: unknown },
): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:write');
  return moveDealInOrg(ctx, scope, params.dealId, params.stageId);
}

export async function winDeal(
  params: Session & { dealId: string; valueMinor?: unknown; closedOn?: unknown; note?: unknown },
): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:write');
  return winDealInOrg(ctx, scope, params.dealId, params);
}

export async function loseDeal(
  params: Session & { dealId: string; lossReasonId?: unknown; closedOn?: unknown; note?: unknown },
): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:write');
  return loseDealInOrg(ctx, scope, params.dealId, params);
}

export async function reopenDeal(params: Session & { dealId: string }): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:write');
  return reopenDealInOrg(ctx, scope, params.dealId);
}

export async function deleteDeal(params: Session & { dealId: string }): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:write');
  return deleteDealInOrg(ctx, scope, params.dealId);
}

export async function getDeal(params: Session & { dealId: string }): Promise<Deal> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getDealInOrg(ctx, scope, params.dealId);
}

export async function listDeals(params: Session & ListDealsParams): Promise<Deal[]> {
  const { ctx, scope } = await access(params, 'crm:read');
  return listDealsInOrg(ctx, scope, params);
}

/** The kanban header: per stage, the open total and its weighted value, won this month. */
export async function getBoard(
  params: Session & { pipelineId: unknown; who?: unknown },
): Promise<Board> {
  const { ctx, scope } = await access(params, 'crm:read');
  return getBoardInOrg(ctx, scope, params);
}

export type {
  Board,
  Deal,
  DealInput,
  DealItem,
  ListDealsParams,
  LossReason,
  Pipeline,
  Stage,
  DisqualifyReason,
  Lead,
  LeadInput,
  LeadSource,
  LeadState,
  ListLeadsParams,
  Activity,
  ActivityInput,
  ActivityKind,
  ListActivitiesParams,
  Attachment,
  Note,
  NoteKind,
  TimelineItem,
  DuplicatePair,
  DuplicateReason,
  Contact,
  Company,
  AnafLookup,
  ListContactsParams,
  CustomField,
  CustomValues,
  Tag,
  Segment,
  SegmentRule,
};
