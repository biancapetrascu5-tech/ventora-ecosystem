export type { EmailChannel, SendEmailParams } from './email';
export {
  EmailNotConfiguredError,
  DEFAULT_FROM,
  DEFAULT_REPLY_TO,
  emailFrom,
  emailReplyTo,
  supportEmail,
} from './email';
export { ResendEmailAdapter } from './adapters/resend';
export { LogEmailAdapter } from './adapters/log';
export { UnconfiguredEmailChannel } from './adapters/unconfigured';
export { CaptureEmailAdapter } from './adapters/capture';
export { makeEmailChannel, setEmailChannel, getEmailChannel, deliverEmail } from './channel';
export type { DeliveryResult, EmailFailureReason } from './channel';
export { passwordResetLink, invitationLink } from './links';
export type { AuthApp } from './links';
export {
  renderPasswordReset,
  renderPasswordChanged,
  renderMemberInvitation,
  renderOwnerInvitation,
  renderOwnerRecovery,
  renderSupportSessionOpened,
} from './templates/index';
export type { RenderedEmail, MembershipRoleName } from './templates/index';
export { sendOwnerRecoveryNotice } from './owner-recovery';
export { sendSupportSessionNotice } from './support-session';
