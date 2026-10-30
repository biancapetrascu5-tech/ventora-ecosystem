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

export { ChooseBusinessView } from './ChooseBusinessView';
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
