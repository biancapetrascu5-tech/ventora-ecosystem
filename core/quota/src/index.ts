/**
 * @ventora/quota — the quota API for the modules (ARCHITECTURE §8.1–8.3), Lot 3.3.
 *
 * The tables live in schema `commercial` and the limit is the effective entitlement, so the
 * implementation is in core/commercial; this package is the stable entry point the modules use
 * (CLAUDE.md, „core/quota”). The E8 prototype (tables lab_core.*) is gone. C-F3-8: the
 * confirmation step is `commitQuota`, as in ARCHITECTURE §8.1 and §8.3.
 */
export {
  checkQuota,
  reserveQuota,
  commitQuota,
  releaseQuota,
  refundQuota,
  freeStockQuota,
  reconcileExpiredReservations,
  reconcileOrganization,
  registerOperationResolver,
  getUsage,
  RESERVATION_TTL_MS,
  QUOTA_THRESHOLDS,
  type QuotaContext,
  type QuotaState,
  type ReserveResult,
  type ReservationStatus,
  type OperationResolver,
  type ReconcileResult,
} from '@ventora/commercial';
