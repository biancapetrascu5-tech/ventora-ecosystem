// The public API of the booking module (ARCHITECTURE §3): the only import allowed from outside.
// Lot B.4a: the appointments, their 7 states, the blocked times, the clients, the booking rules
// (they replace the proof contract of Lots 2.3 / 3.3)
export {
  createAppointment,
  getAppointment,
  listAppointmentHistory,
  listAppointments,
  moveAppointment,
  updateAppointmentNote,
  confirmAppointment,
  startAppointment,
  completeAppointment,
  markNoShow,
  cancelAppointment,
  correctAppointmentStatus,
  addTimeBlock,
  updateTimeBlock,
  archiveTimeBlock,
  listTimeBlocks,
  searchClients,
  createClient,
  updateClient,
  getBookingSettings,
  setBookingSettings,
  countUpcomingAppointments,
} from './appointments';
// Lot B.4b: the refund of booking.appointments (consumer of booking.appointment.cancelled),
// registered by the app that runs the outbox dispatcher
export { bookingQuotaRefundConsumer } from '../server/quota';
// Review #164: the internal job that closes the expired public holds and clears the old hashes
export { runPublicHoldCleanupJob } from '../server/public-cleanup';
// Lot B.13: the confirmation and the reminder by e-mail (the job booking.client-emails)
export { runClientEmailJob, renderClientEmail } from '../server/client-emails';
export type {
  ClientEmailJobReport,
  ClientEmail,
  ClientEmailInput,
  ClientMessageKind,
} from '../server/client-emails';
export type { PublicHoldCleanupReport } from '../server/public-cleanup';
export type { BookingOutboxConsumer } from '../server/quota';
export type {
  Appointment,
  AppointmentDetail,
  AppointmentHistoryItem,
  AppointmentStatus,
  BookingSettings,
  Client,
  ClientLocale,
  TimeBlock,
  CreateAppointmentParams,
  AppointmentIdParams,
  MoveAppointmentParams,
  UpdateAppointmentNoteParams,
  CancelAppointmentParams,
  CorrectAppointmentStatusParams,
  ListAppointmentsParams,
  TimeBlockInputParams,
  AddTimeBlockParams,
  UpdateTimeBlockParams,
  TimeBlockIdParams,
  ListTimeBlocksParams,
  SearchClientsParams,
  ClientFields,
  ClientParams,
  UpdateClientParams,
  SetBookingSettingsParams,
  CountUpcomingAppointmentsParams,
  UpcomingAppointments,
  ThanksWhen,
  ListedAppointment,
} from './appointments';
// Lot B.14c: when the reminder and the thanks leave
export { ONLINE_SETTINGS_LIMITS, SEND_TIMING_LIMITS, THANKS_WHEN } from './appointments';
// Lot B.14c: „Trimite reamintire” by hand
export { sendAppointmentReminders, MANUAL_REMINDER_LIMITS } from './appointments';
export type {
  SendAppointmentRemindersParams,
  ManualReminderResult,
  ManualReminderSkip,
} from './appointments';
// Lot B.1: the service catalog
export {
  listServices,
  getService,
  createService,
  updateService,
  archiveService,
  restoreService,
  listServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  archiveServiceCategory,
  restoreServiceCategory,
  reorderServiceCategories,
} from './services';
export type {
  Service,
  ServiceCategory,
  ServiceInputParams,
  PriceKind,
  Currency,
  ListServicesParams,
  GetServiceParams,
  CreateServiceParams,
  UpdateServiceParams,
  ServiceIdParams,
  ListServiceCategoriesParams,
  ServiceCategoryParams,
  UpdateServiceCategoryParams,
  ServiceCategoryIdParams,
  ReorderServiceCategoriesParams,
} from './services';
// Lot B.2: the members in the calendar and their schedule (design S124, BookingTeamSchedule)
export {
  getBusinessHours,
  setBusinessHours,
  listStaff,
  updateStaffMember,
  reorderStaff,
  getStaffSchedule,
  setStaffWeeklyHours,
  setStaffDayOverride,
  archiveStaffDayOverride,
  addStaffTimeOff,
  updateStaffTimeOff,
  archiveStaffTimeOff,
  getStaffAvailability,
} from './staff';
export type {
  AvailabilityDay,
  BusinessDay,
  BusinessHoursSaved,
  Interval,
  ScheduleError,
  StaffCutToBusinessHours,
  StaffDayOverride,
  StaffEligibility,
  StaffList,
  StaffListWithAppointments,
  WithUpcomingAppointments,
  StaffListItem,
  StaffMember,
  StaffNext,
  StaffSchedule,
  StaffTimeOff,
  WorkDay,
  BusinessDayInput,
  WorkDayInput,
  TimeOffInput,
  SetBusinessHoursParams,
  UpdateStaffMemberParams,
  ReorderStaffParams,
  GetStaffScheduleParams,
  SetStaffWeeklyHoursParams,
  SetStaffDayOverrideParams,
  StaffDayOverrideIdParams,
  AddStaffTimeOffParams,
  UpdateStaffTimeOffParams,
  StaffTimeOffIdParams,
  GetStaffAvailabilityParams,
} from './staff';
// Lot B.5: the free slots, „Primul loc liber”, „Oricine e liber” (createAppointment accepts 'any')
export { getFreeSlots, findFirstFreeSlot } from './availability';
export type { GetFreeSlotsParams, FindFirstFreeSlotParams } from './availability';
export type { FreeSlot, FreeSlotDay, FreeSlots, FirstFreeSlot } from '../server/availability';
// Lot B.3a: the bookable resources (design S124 BookingResources)
export {
  listResources,
  getResource,
  createResource,
  updateResource,
  archiveResource,
  restoreResource,
  reorderResources,
} from './resources';
export type {
  ResourceFields,
  ListResourcesParams,
  ResourceIdParams,
  CreateResourceParams,
  UpdateResourceParams,
  ReorderResourcesParams,
} from './resources';
export type { Resource, ResourceKind } from '../server/resources';
// Lot B.2b: who does each service (design S129)
export { setServiceStaff } from './services';
export type { SetServiceStaffParams } from './services';
export { setStaffServices } from './staff';
export type { SetStaffServicesParams } from './staff';
export type { DoneBy, MemberServices, StoppedPair } from '../server/staff-services';
export type { DoneByInput } from '../server/services';
// Lot B.2c: the duration and the price of a service for one member
export { listStaffServiceTerms, setStaffServiceTerms } from './staff';
export type { ListStaffServiceTermsParams, SetStaffServiceTermsParams } from './staff';
export type { EffectiveTerms, StaffServiceTerms } from '../server/terms';
// Lot B.7a: the client card, the blocked clients, the merge, the GDPR erasure (ClientDesk: D-CRM-9)
export {
  getClientCard,
  listClientAppointments,
  listBlockedClients,
  blockClient,
  unblockClient,
  mergeClients,
  eraseClient,
} from './clients';
export type {
  ClientIdParams,
  ListClientAppointmentsParams,
  BlockClientParams,
  MergeClientsParams,
} from './clients';
export type {
  BlockedClient,
  ClientBlock,
  ClientCard,
  ClientCardAppointment,
} from '../server/clients';
// Lot B.7b: the behaviour note (S139; only „Risc ridicat”, never outside EasyBook)
export { getBehaviorNoteSettings, setBehaviorNoteSettings, removeBehaviorNote } from './clients';
export type { SetBehaviorNoteSettingsParams, RemoveBehaviorNoteParams } from './clients';
export type { BehaviorNote, BehaviorNoteSettings } from '../server/behavior';
// Lot B.8: the health fields (D-B-14; only on businesses marked medical)
export {
  listMedicalFields,
  createMedicalField,
  updateMedicalField,
  archiveMedicalField,
  recordMedicalConsent,
  saveMedicalAnswers,
  getMedicalAnswers,
  withdrawMedicalConsent,
} from './medical';
export type {
  MedicalFieldFields,
  ListMedicalFieldsParams,
  CreateMedicalFieldParams,
  UpdateMedicalFieldParams,
  MedicalFieldIdParams,
  RecordMedicalConsentParams,
  SaveMedicalAnswersParams,
  MedicalClientParams,
} from './medical';
export type {
  MedicalAnswers,
  MedicalConsent,
  MedicalField,
  MedicalFieldKind,
} from '../server/medical';
// Lot B.21: the payments of an appointment, without a provider (C-B-2: booking.payment.recorded)
export {
  recordPayment,
  recordRefund,
  getAppointmentPayments,
  getClientPaymentTotals,
} from './payments';
export type {
  RecordPaymentParams,
  RecordRefundParams,
  AppointmentPaymentsParams,
  ClientPaymentTotalsParams,
} from './payments';
export type { AppointmentBalance, AppointmentPayment, PaymentMethod } from '../server/payments';
// Lot B.21b: „Data încasării” — how far back a payment can be dated
export { PAYMENT_DATE_LIMITS } from '../server/payments';
// Lot B.24: the operational reports and the CSV export (Excel: exceljs, a proposal)
export { getBookingReport, exportAppointmentsCsv } from './reports';
export type { BookingReportParams, ExportAppointmentsParams } from './reports';
export type { BookingReport, MoneyByCurrency } from '../server/reports';

// Lot B.11a: the public booking page (no session; the business from the slug)
export {
  getPublicBookingPage,
  getPublicFreeSlots,
  getPublicClassSessions,
  startPublicBooking,
  verifyPublicBooking,
  resendPublicBookingCode,
  configurePublicBooking,
  requestPublicAnswerPhoto,
  confirmPublicAnswerPhoto,
} from './public';
export type {
  PublicSlotsParams,
  PublicClassSessionsParams,
  StartPublicBookingParams,
  CaptchaVerifier,
  PublicBookingPage,
  TodayHours,
  PublicBookingResult,
  PublicClassSession,
  PublicHoldResult,
} from './public';

// Lot B.11b: the client's page for moving or cancelling (no session; the slug and the token)
export {
  getManagedBooking,
  getManagedFreeSlots,
  startManagedMove,
  confirmManagedMove,
  cancelManagedBooking,
} from './manage';
export type {
  ManagedBooking,
  ManagedCancel,
  ManagedChange,
  ManagedMoveHold,
  ManageState,
  MoveRefusal,
} from './manage';

// Lot B.12: the questions at booking (BookingCustomForms, S127)
export {
  listFormQuestions,
  createFormQuestion,
  updateFormQuestion,
  archiveFormQuestion,
  reorderFormQuestions,
  getAppointmentAnswers,
  saveAppointmentAnswers,
  getAnswerPhotoLink,
  getClientLastAnswers,
} from './forms';
export type {
  FormQuestionFields,
  ListFormQuestionsParams,
  CreateFormQuestionParams,
  UpdateFormQuestionParams,
  FormQuestionIdParams,
  ReorderFormQuestionsParams,
  AppointmentAnswersParams,
  SaveAppointmentAnswersParams,
  AppointmentAnswer,
  ClientLastAnswer,
  FormAnswerValue,
  FormQuestion,
  FormQuestionKind,
} from './forms';
export type { PublicFormQuestion } from '../server/forms';

// Lot B.9a: several services in one visit (BookingMultiService, S126)
export { createVisit, getVisit, findVisitStart, moveVisit, cancelVisit } from './visits';
export type {
  CreateVisitParams,
  VisitStepParams,
  VisitIdParams,
  MoveVisitParams,
  CancelVisitParams,
  FindVisitStartParams,
} from './visits';
export type { Visit } from '../server/visits';
export type { VisitStart } from '../server/availability';
export type { VisitRef } from '../server/appointments';

// Lot B.9b: the recurring appointments (BookingRecurring, S126)
export { previewSeries, createSeries, getSeries, moveSeries, cancelSeries } from './series';
export type {
  SeriesRuleParams,
  PreviewSeriesParams,
  CreateSeriesParams,
  SeriesIdParams,
  MoveSeriesParams,
  CancelSeriesParams,
} from './series';
export type { Series, SeriesFrequency, SeriesOccurrence, SeriesPreview } from '../server/series';
export type { SeriesRef } from '../server/appointments';

// Lot B.9d1: the classes (BookingClasses, S126)
export {
  createClassSessions,
  listClassSessions,
  getClassSession,
  addClassParticipant,
  markClassAttendance,
  cancelClassSession,
  addToClassWaitlist,
} from './classes';
export type {
  CreateClassSessionsParams,
  ListClassSessionsParams,
  ClassSessionIdParams,
  AddClassParticipantParams,
  MarkClassAttendanceParams,
  AddToClassWaitlistParams,
} from './classes';
export type { ClassSession, ClassSessionDetail, ClassSessionStatus } from '../server/classes';

// Lot B.9c: the waiting list (BookingWaitlist, S126) and its internal job
export {
  addToWaitlist,
  listWaitlist,
  removeFromWaitlist,
  findWaitlistMatches,
  offerWaitlistSlot,
  getWaitlistOffer,
  acceptWaitlistOffer,
  declineWaitlistOffer,
  issueWaitlistOfferLink,
} from './waitlist';
export type {
  AddToWaitlistParams,
  ListWaitlistParams,
  WaitlistEntryIdParams,
  FindWaitlistMatchesParams,
  OfferWaitlistSlotParams,
  WaitlistOfferLinkParams,
  WaitlistOfferIdParams,
} from './waitlist';
export { runWaitlistOfferJob } from '../server/waitlist';
export type {
  PublicWaitlistOffer,
  WaitlistEntry,
  WaitlistEntryStatus,
  WaitlistOffer,
  WaitlistOfferJobReport,
  WaitlistOfferState,
  WaitlistTimeKind,
} from '../server/waitlist';

// Lot B.9e: the packages of sessions (BookingPackages, S126)
export {
  listPackages,
  createPackage,
  updatePackage,
  archivePackage,
  sellPackage,
  extendPackageSale,
  listClientPackages,
  setAppointmentPackage,
} from './packages';
export type {
  CreatePackageParams,
  UpdatePackageParams,
  PackageIdParams,
  ListPackagesParams,
  SellPackageParams,
  ExtendPackageSaleParams,
  ListClientPackagesParams,
  SetAppointmentPackageParams,
} from './packages';
export type {
  BookingPackage,
  PackageSale,
  PackageSaleStatus,
  PackageUseItem,
  PackagePaymentMethod,
  PackageValidityMonths,
} from '../server/packages';

// Lot B.14b: the texts of the client e-mails (Setări · Mesaje, S127)
export {
  getMessageTemplate,
  listMessageTemplates,
  previewMessageTemplate,
  resetMessageTemplate,
  saveMessageTemplate,
} from './message-templates';
export type {
  ClientEmailParts,
  MessageTemplate,
  MessageTemplateInput,
  MessageTemplateRef,
  MessageTemplateSummary,
  TemplateKind,
} from './message-templates';
