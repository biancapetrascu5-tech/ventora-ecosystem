export type { EmailChannel, SendEmailParams } from './email.js';
export {
  EmailNotConfiguredError,
  DEFAULT_FROM,
  DEFAULT_REPLY_TO,
  emailFrom,
  emailReplyTo,
  supportEmail,
} from './email.js';
export { ResendEmailAdapter } from './adapters/resend.js';
export { LogEmailAdapter } from './adapters/log.js';
export { UnconfiguredEmailChannel } from './adapters/unconfigured.js';
export { CaptureEmailAdapter } from './adapters/capture.js';
export { makeEmailChannel, setEmailChannel, getEmailChannel, deliverEmail } from './channel.js';
export type { DeliveryResult, EmailFailureReason } from './channel.js';
export { passwordResetLink, invitationLink } from './links.js';
export type { AuthApp } from './links.js';
export {
  renderPasswordReset,
  renderMemberInvitation,
  renderOwnerInvitation,
  renderOwnerRecovery,
} from './templates/index.js';
export type { RenderedEmail, MembershipRoleName } from './templates/index.js';
export { sendOwnerRecoveryNotice } from './owner-recovery.js';
