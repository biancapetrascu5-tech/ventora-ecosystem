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
