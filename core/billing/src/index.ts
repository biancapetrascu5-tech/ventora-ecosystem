// Lot 3.5 — core/billing: payments with the card through Stripe (ARCHITECTURE §8.6, D3-4 a).
export {
  getBillingAccount,
  startCardSetup,
  brandLabel,
  type BillingContext,
  type SavedCard,
} from './account';
export { confirmCardSetup } from './cards';
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
export { billingPaymentFailedConsumer } from './notify';
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
