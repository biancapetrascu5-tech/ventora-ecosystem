// Lot 3.5 — core/billing: payments with the card through Stripe (ARCHITECTURE §8.6, D3-4 a).
export {
  getBillingAccount,
  startCardSetup,
  brandLabel,
  type BillingContext,
  type SavedCard,
} from './account';
export { confirmCardSetup } from './cards';
// Lot 3.7: the payments under „Facturi” (the invoice itself: Lot 3.6)
export { listPayments, PAYMENTS_LISTED, type PaymentRow } from './history';
export {
  previewPurchase,
  purchase,
  confirmPurchase,
  prorated,
  PurchaseRefused,
  type PurchaseResult,
  type PurchasePreview,
  type PurchaseStatus,
} from './purchases';
export {
  reconcileSubscription,
  runStripeReconcileJob,
  anchorFor,
  type ReconcileOutcome,
} from './subscriptions';
export {
  handleStripeWebhook,
  processStripeEvent,
  WebhookSignatureError,
  type WebhookOutcome,
} from './webhook';
export {
  billingPaymentFailedConsumer,
  billingInvoiceIssuedConsumer,
  billingDisputeAlertConsumer,
} from './notify';
// Lot 3.6: the invoice of every payment (SmartBill), the storno, the Founder reads
export {
  invoiceIssueConsumer,
  issueInvoice,
  runInvoiceIssueJob,
  setInvoiceApplicationNames,
  setInvoiceBuyerResolver,
  romanianDate,
  romanianMonth,
  INVOICE_ALERT_ATTEMPTS,
  type IssueOutcome,
  type InvoiceBuyerResolver,
  type InvoiceSummary,
} from './invoices';
export {
  getInvoiceProvider,
  setInvoiceProviderFactory,
  setInvoiceProviderForTests,
  InvoiceProviderError,
  UnconfiguredInvoiceProvider,
  type InvoiceProvider,
  type InvoiceProviderName,
  type InvoiceBuyer,
  type InvoiceLine,
  type IssueInvoiceInput,
  type IssuedDocument,
  type ReverseInvoiceInput,
  type InvoiceErrorKind,
} from './invoice-provider';
export {
  SmartBillInvoiceProvider,
  smartBillConfigFromEnv,
  DEFAULT_VAT_MENTION,
  type SmartBillConfig,
} from './smartbill';
export {
  getInvoiceDownloadPath,
  openInvoiceLink,
  signInvoiceToken,
  verifyInvoiceToken,
  InvoiceLinkRefused,
  type InvoiceLinkClaims,
} from './invoice-links';
export { TestInvoiceProvider, type TestInvoiceDocument } from './test-invoice-provider';
export {
  listFailedPaymentsForFounder,
  listOpenDisputesForFounder,
  listInvoicesNeedingAttentionForFounder,
  stripeDisputeUrl,
  type FounderFailedPayment,
  type FounderOpenDispute,
  type FounderInvoiceAttention,
} from './founder';
export {
  getStripeGateway,
  setStripeGatewayForTests,
  signStripePayload,
  type StripeGateway,
  type StripeEventEnvelope,
  type PaymentIntentState,
  type SetupIntentState,
  type CardDetails,
  type SubscriptionState,
  type PriceSpec,
  type CouponSpec,
  type CreateSubscriptionInput,
  type UpdateSubscriptionInput,
} from './stripe';
export { setBillingErrorReporter, type BillingErrorReporter } from './report';
export { closeBillingPools } from './db';
