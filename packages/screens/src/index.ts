// @ventora/screens (D7, 29.10.2026): vederile comune Hub-ului și Founder-ului (autentificare,
// codurile de rezervă, sesiunea de suport și recuperarea din Founder).
// Vederi fără logică (props → UI, texte din chei next-intl); containerele stau în aplicații.

export {
  AuthFrame,
  Head,
  Line,
  Note,
  TextLink,
  PasswordRequirements,
  passwordRules,
  passwordMeetsRules,
  MIN_PASSWORD,
  useClock,
  groupBackupCode,
} from './parts';
export type { AuthBrand } from './parts';

export { SignInView } from './SignInView';
export type { SignInState } from './SignInView';
export { FounderSignInView } from './founder/FounderSignInView';
export type { FounderSignInState } from './founder/FounderSignInView';

export { InviteView } from './InviteView';
export type { InviteData, InviteState } from './InviteView';

export { ChooseBusinessView, SupportNote } from './ChooseBusinessView';
export { SuspendedBusinessView } from './SuspendedBusinessView';
export type { BusinessRow } from './ChooseBusinessView';

export { ResetRequest, ResetSent, ResetNewPassword, ResetDone } from './PasswordResetView';
export type { RequestState, SentState, NewPasswordState } from './PasswordResetView';

export {
  SetupStep1,
  SetupStep2,
  SetupStep3,
  AppsDialog,
  BackupCodesList,
  QrCode,
  groupedKey,
  downloadCodes,
} from './TwoFactorSetupView';
export type { SetupCodeState } from './TwoFactorSetupView';

export { TwoFactorVerify, TwoFactorRecovery, BackupCodesLeftToast } from './TwoFactorVerifyView';
export type { VerifyState } from './TwoFactorVerifyView';

export { BackupCodesBody, BackupCodesPage } from './BackupCodesView';
export type { CodesPageState } from './BackupCodesView';
export { default as codesStyles } from './codes.module.css';
export { default as authStyles } from './auth.module.css';

export { encodeQr } from './qr';

// Containerele (cu logica de API); diferențele de aplicație vin din AuthAppProvider.
export { AuthAppProvider, useAuthApp } from './screens/config';
export type { AuthAppConfig, AuthRoutes } from './screens/config';
export { SignInScreen } from './screens/SignInScreen';
export { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
export { ResetPasswordScreen } from './screens/ResetPasswordScreen';
export type { ResetLinkInfo } from './screens/ResetPasswordScreen';
export { TwoFactorVerifyScreen } from './screens/TwoFactorVerifyScreen';
export { TwoFactorSetupScreen } from './screens/TwoFactorSetupScreen';
export { BackupCodesLeftNotice } from './screens/BackupCodesLeftNotice';
export { useIsPhone, emailProblem } from './screens/hooks';
export { setHandoff, readHandoff, takePassword } from './handoff';
export * as authApi from './auth-api';

// Founder (doar română, S57): sesiunea de suport și recuperarea proprietarului (Lotul 2.5c).
export {
  OpenSupportDialog,
  FounderSupportBanner,
  CloseFounderSupportDialog,
  FounderSupportClosedToast,
  REASON_MIN,
  REASON_MAX,
  TICKET_MAX,
  DURATIONS,
} from './founder/FounderSupportView';
export type { OpenFormState } from './founder/FounderSupportView';
export {
  RecoveryForm,
  RecoveryDrawer,
  RecoveryConfirmDialog,
  RecoveryDone,
  EMPTY_RECOVERY,
  CHECK_CODE,
  ruleHolds,
  canSubmit,
} from './founder/OwnerRecoveryView';
export type { Check, RecoveryValues, RecoveryFlags } from './founder/OwnerRecoveryView';
export { default as founderSupportStyles } from './founder/support.module.css';

// Ora și data în ecrane (S110; engleza britanică, Lot 2.8).
export { useWhen, useDates, useTimeZone, intlLocale } from './when';
export type { DateFormats } from './when';

// Founder · afacerile (Lot 2.8, doar română): lista, pagina unei afaceri, „Afacere nouă”.
export { BusinessesView, useTableLabels } from './founder/BusinessesView';
export type { BusinessListRow, BusinessStatus } from './founder/BusinessesView';
export {
  BusinessView,
  ReactivateBusinessDialog,
  SuspendBusinessDialog,
} from './founder/BusinessView';
export type { BusinessMenuItem, BusinessChange } from './founder/BusinessView';
export { NewBusinessView } from './founder/NewBusinessView';
export type { NewBusinessState, NewBusinessBuy, NewBusinessOffer } from './founder/NewBusinessView';
export { default as businessStyles } from './founder/business.module.css';

// Founder · modelul comercial (Lotul 3.4, doar română; D3-24): aplicațiile la bucată, pachetele,
// consumul, cererile din Hub, reducerile, partea comercială a unei afaceri, „Prezentare”.
export * from './founder/commercial/money';
export { PacksView, PackDialog } from './founder/commercial/PacksView';
export type { PackRow, PackFormValues, PackFormErrors } from './founder/commercial/PacksView';
export { AppsView, AppPriceDrawer } from './founder/commercial/AppsView';
export { BundlesView, BundleApps, StopBundleDialog } from './founder/commercial/BundlesView';
export type {
  BundleCardData,
  BundleStatus,
  BundleVersionRow,
} from './founder/commercial/BundlesView';
export { BundleEditorView, BundleEditorBar } from './founder/commercial/BundleEditorView';
export type {
  BundleEditorState,
  EditorPrices,
  EditorField,
} from './founder/commercial/BundleEditorView';
export type { AppRow, AppPriceValues, AppPriceErrors } from './founder/commercial/AppsView';
export { UsageView, TooEarly, useChartLabels } from './founder/commercial/UsageView';
export type { UsageRow } from './founder/commercial/UsageView';
export { RequestsView, RefuseRequestDialog } from './founder/commercial/RequestsView';
export type { RequestRow, RequestStatus } from './founder/commercial/RequestsView';
export {
  BusinessBillingView,
  DiscountsPageView,
  DiscountDialog,
  EndDiscountDialog,
} from './founder/commercial/DiscountsView';
export type {
  DiscountRow,
  ForeverDiscountRow,
  DiscountFormValues,
  DiscountFormErrors,
} from './founder/commercial/DiscountsView';
export {
  BusinessUsageSection,
  ExceptionsSection,
  PlanCardContent,
  ExceptionDialog,
  useUsageLabels,
} from './founder/commercial/BusinessCommercial';
export type {
  UsageItem,
  ExceptionRow,
  ExceptionFormValues,
  ExceptionFormErrors,
} from './founder/commercial/BusinessCommercial';
export { OverviewView, greetingPart } from './founder/commercial/OverviewView';
export type {
  OverviewState,
  OverviewData as OverviewViewData,
  OverviewException,
  OverviewLimitRow,
  OverviewRecentRow,
  OverviewFailedPayment,
  OverviewDispute,
  OverviewInvoiceIssue,
} from './founder/commercial/OverviewView';
export { default as commercialStyles } from './founder/commercial/commercial.module.css';

// Lotul 4.10 — FounderAutomations (S116)
export {
  AutomationsListView,
  AutomationBuilderView,
  AutomationBusinessesView,
  TurnOnOffDialog,
  RunsView,
} from './founder/automations/AutomationsView';
export type {
  AutomationListRow,
  BuilderLine,
  BuilderOption,
  BusinessActivationRow,
  RunFilter,
  RunRow,
  RunStatus,
} from './founder/automations/AutomationsView';
// Lot 4.6: Suport — HubSupport, HubSupportThread (Hub, 6 limbi), FounderSupportInbox (Founder, RO)
export {
  HubSupportView,
  NewRequestForm,
  HUB_PILL,
  useUploadLabels,
} from './support/HubSupportView';
export type {
  HubSupportRow,
  HubStatusKey,
  NewRequestValues,
  NewRequestErrors,
} from './support/HubSupportView';
export { HubSupportThreadView } from './support/HubSupportThreadView';
export type { ComposerState, ComposerHandlers } from './support/HubSupportThreadView';
export { FounderSupportInboxView, FOUNDER_PILL } from './support/FounderSupportInboxView';
export type { FounderInboxRow, FounderGroup } from './support/FounderSupportInboxView';
export { FounderSupportThreadView } from './support/FounderSupportThreadView';
export type { FounderThreadSide } from './support/FounderSupportThreadView';
export {
  SupportMsg,
  SupportHistory,
  useSupportUploads,
  fileIcon,
  sizeLabel,
  SUPPORT_ACCEPT,
  SUPPORT_MAX_BYTES,
} from './support/parts';
export type {
  SupportMessageData,
  SupportHistoryData,
  SupportFileData,
  StartUpload,
  FinishUpload,
} from './support/parts';
export { default as supportStyles } from './support/support.module.css';
// Lotul 3.8 (S121): datele de facturare, factura neemisă, cererile cu implementare
export {
  BillingProfileCard,
  BillingProfileForm,
  BillingProfileDrawer,
  InvoiceNotIssuedNotice,
  InvoiceHistorySection,
  ManualIssueDialog,
  SetupPill,
  SetupRequestsList,
  SetupRequestDrawer,
  SetupGoLiveDialog,
  SetupCancelDialog,
  RO_COUNTIES,
  PROFILE_COUNTRIES,
  countryName,
} from './founder/commercial/LifecycleViews';
export type {
  BillingProfileValues,
  BillingProfileErrors,
  InvoiceHistoryRow,
  InvoiceHistoryStatus,
  ManualIssueValues,
  SetupState,
  SetupRow,
  SetupOfferValues,
} from './founder/commercial/LifecycleViews';

// Lotul 5.10 — Founder · Growth & Campaigns
export { GrowthControlView } from './founder/growth/GrowthControlView';
export type {
  GrowthCaps,
  GrowthLogRow,
  GrowthStopTarget,
  GrowthSwitchRow,
} from './founder/growth/GrowthControlView';
