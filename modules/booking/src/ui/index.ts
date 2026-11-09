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
