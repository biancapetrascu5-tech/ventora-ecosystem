// Lot B.1-UI: the screens of the booking module (ARCHITECTURE §3, modules/<app>/src/ui), built only
// from @ventora/ui. Client code only: the server contract stays in '@ventora/booking'.
export {
  BookingServicesView,
  type BookingServicesViewProps,
  type ScreenMode,
  type CategoryGroup,
  type ArchivedServiceRow,
  type ArchivedCategoryRow,
} from './services/BookingServicesView';
export {
  ServiceFormDrawer,
  NEW_CATEGORY,
  type ServiceFormDrawerProps,
} from './services/ServiceFormDrawer';
export {
  CategoryDialog,
  CategoryOrderDialog,
  ArchiveServiceDialog,
  CategoryBlockedDialog,
  FrameOverlay,
  type OrderItem,
} from './services/ServiceDialogs';
export {
  BookingSettingsHeader,
  ServicesToast,
  SettingsToast,
  SETTINGS_TABS,
  type SettingsTab,
} from './services/BookingSettingsHeader';
export { useServiceTexts, type ServiceRow } from './services/texts';
export {
  validateServiceForm,
  emptyServiceForm,
  formFromService,
  findNameClash,
  matchesQuery,
  moveItem,
  membersOf,
  membersOfCategory,
  termsForm,
  type MemberTermsForm,
  type MemberTermsInput,
  type ServiceForm,
  type FormErrors,
  type ServiceInput,
  type TeamMember,
} from './services/format';
export { ServiceMembers, type ServiceMembersProps } from './services/ServiceMembers';
export { default as servicesStyles } from './services/services.module.css';
// Lot B.2-UI: EasyBook · Setări · „Programul echipei” (BookingTeamSchedule, S124)
export {
  BookingTeamView,
  type BookingTeamViewProps,
  type TeamMemberRow,
  type RemovedMemberRow,
  type LeftWithBookings,
} from './team/BookingTeamView';
export {
  StaffScheduleDrawer,
  type StaffScheduleDrawerProps,
  type OverrideRow,
  type TimeOffRow,
} from './team/StaffScheduleDrawer';
export { ExceptionDialog, TimeOffDialog, type BookingsInRange } from './team/TeamDialogs';
export { useTeamTexts, type StaffNextData } from './team/team-texts';
export {
  businessOf,
  dayForm,
  dayInput,
  leaveDays,
  validateDay,
  validateTimeOff,
  validateWeek,
  weekdayOfDate,
  WEEKDAYS,
  type BusinessDayData,
  type DayError,
  type DayForm,
  type IntervalData,
  type WeekForm,
} from './team/team-format';
// Lot B.6a: BookingCalendar (day, week, resources)
export {
  BookingCalendarView,
  type BookingCalendarViewProps,
  type FirstFreeResult,
  type StaffOption,
} from './calendar/BookingCalendarView';
export { FirstFreeDialog, type FirstFreeDialogProps } from './calendar/FirstFreeDialog';
export { useCalendarTexts, type CalendarTexts } from './calendar/calendar-texts';
export {
  activeCount,
  addDays,
  dayColumn,
  gridHours,
  scheduleStatus,
  stepDate,
  toEvents,
  weekDays,
  weekdayOf,
  weekStart,
  type CalendarAppointment,
  type CalendarAppointmentStatus,
  type CalendarBlock,
  type CalendarView,
} from './calendar/calendar-format';
// Lot B.6b: BookingToday („Azi”)
export {
  ATTENTION_MAX,
  BookingTodayView,
  type BookingTodayViewProps,
  type TodayActions,
  type TodayAttention,
  type TodayCurrent,
  type TodayNext,
} from './today/BookingTodayView';
// Lot B.6c: BookingNew („Programare nouă”)
export {
  BookingNewView,
  BookingNewBar,
  useNewTexts,
  type BookingNewViewProps,
  type NewClientOption,
} from './new/BookingNewView';
export {
  validateNew,
  hasErrors,
  effectiveTerms,
  serviceTerms,
  spanOf,
  differs,
  durationFor,
  dayText,
  type NewForm,
  type NewErrors,
  type NewService,
  type NewStaff,
  type NewMemberTerms,
  type NewCurrency,
  type NewPriceKind,
  type Terms,
} from './new/new-format';
// Lot B.6a / S116 f: BookingDetail + BookingStatuses (the drawer, the 7 states, the dialogs)
export {
  BookingDetailDrawer,
  type BookingDetailDrawerProps,
  type DetailButton,
  type DetailMenuItem,
} from './detail/BookingDetailDrawer';
export {
  CancelAppointmentDialog,
  MoveAppointmentDialog,
  CorrectStatusDialog,
} from './detail/DetailDialogs';
export {
  STATUS_LOOK,
  FINAL,
  CORRECT_WINDOW_MS,
  actionsFor,
  correctTarget,
  historyLine,
  type ActionContext,
  type DetailAction,
  type DetailStatus,
  type HistoryRow,
} from './detail/detail-format';
// BookingList (Decision 7, screen 4)
export {
  BookingListView,
  type BookingListViewProps,
  type ListRow,
  type ListPeriod,
  type ListStateFilter,
} from './list/BookingListView';
// BookingStates: the states that complete the screens, with the approved copy
export {
  EmptyDay,
  NothingToDo,
  LoadError,
  CalendarHint,
  ListEmptyFiltered,
  ListEmptyAll,
  OtherDaysNotice,
  BulkCancelDialog,
  UnsavedDialog,
} from './states/BookingStates';
// Lot B.14b: EasyBook · Setări · „Mesaje” (BookingMessageTemplates, S127)
export {
  BookingMessagesView,
  type BookingMessagesViewProps,
  type MessageChannel,
  type MessageId,
  type MessageRow,
} from './messages/BookingMessagesView';
export {
  MessageEditorDrawer,
  SmsPreview,
  smsLength,
  type MessageEditorDrawerProps,
  type WhenOption,
} from './messages/MessageEditorDrawer';
export { EmailPreview, type EmailPreviewData } from './messages/EmailPreview';
export { SETTINGS_TABS_S127 } from './services/BookingSettingsHeader';
export {
  TEMPLATE_LIMITS,
  TEMPLATE_VARS,
  unknownVariables,
  type TemplateKind,
} from '../server/template-text';
// BookingClientCard (Decision 7, screen 4): the client card
export {
  BookingClientCardView,
  ClearRiskDialog,
  HealthLocked,
  type BookingClientCardViewProps,
  type ClientHistoryItem,
} from './client/BookingClientCardView';
// Lot B.14c: the limits of „Când pleacă” (pure, the same numbers as the server)
export { SEND_TIMING_LIMITS, THANKS_WHEN, type ThanksWhen } from '../server/send-timing';
