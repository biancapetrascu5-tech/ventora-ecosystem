// The public API of the booking module (ARCHITECTURE §3): the only import allowed from outside.
// Lot 2.3 / 3.3: the proof contract of the appointments (stubs until B.4).
export { listAppointments, createAppointment, getAppointment } from './appointments.js';
export type {
  Appointment,
  ListAppointmentsParams,
  CreateAppointmentParams,
  GetAppointmentParams,
} from './appointments.js';
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
} from './services.js';
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
} from './services.js';
