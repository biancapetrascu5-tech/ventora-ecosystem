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
  type ServiceForm,
  type FormErrors,
  type ServiceInput,
} from './services/format';
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
