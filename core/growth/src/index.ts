/**
 * @ventora/growth — Growth Engine v1 (FAZA-5, D-GRW-1…16). Lot 5.5: the schema, the module roles
 * and the slot registry. The decision engine (5.6), the signals and conversions (5.7) and the
 * automatic stop (5.8) build on it.
 */
export { closeGrowthPools, withAppCatalogTx, withAppTx, withFounderTx } from './db';
export {
  HUB_PLACEMENT_SOURCE,
  collectPlacements,
  isPlacementSyncNoop,
  syncPlacements,
  type PlacementSource,
  type PlacementSyncResult,
} from './registry';
export {
  decide,
  matchRule,
  ownsTarget,
  slotCampaigns,
  type CatalogCampaign,
  type CatalogOffer,
  type CatalogPlacement,
  type CatalogSnapshot,
  type Candidate,
  type DecideInput,
  type DecideResult,
  type GrowthRole,
  type NoneReason,
  type PersonState,
  type SubjectFacts,
} from './decide';
export { commercialPorts, type GrowthPorts } from './ports';
export {
  clearGrowthCache,
  getSlotContent,
  loadCatalog,
  recordInteraction,
  type InteractionKind,
  type InteractionRequest,
  type SlotLogger,
  type SlotRequest,
} from './service';
export {
  GROWTH_CONVERSIONS,
  GROWTH_SIGNALS,
  defineGrowthConsumer,
  growthConversionConsumer,
  growthSignalConsumer,
  recordFeatureLockedClick,
} from './signals';
export {
  GROWTH_CAP_LIMITS,
  GROWTH_LOG_ACTIONS,
  approveOfferText,
  archiveOffer,
  campaignOverlaps,
  createCampaign,
  createOffer,
  getGrowthControlForFounder,
  listCampaignsForFounder,
  listGrowthLogForFounder,
  listOffersForFounder,
  publishCampaign,
  publishOffer,
  restartCampaign,
  setOfferBudget,
  saveOfferText,
  setGrowthCaps,
  setGrowthPaused,
  setPlacementStopped,
  stopCampaign,
  updateCampaign,
  updateOfferTarget,
  type FounderCampaign,
  type FounderCampaignInput,
  type FounderOffer,
  type FounderOfferTarget,
  type FounderOfferText,
  type FounderParams,
  type GrowthControlView,
  type GrowthPlacementView,
} from './founder';
export {
  GROWTH_AUTO_STOP_COMPLAINTS,
  recordOptOut,
  runGrowthAutoStopJob,
  runGrowthOfferCheckJob,
  type AutoStopReason,
  type AutoStopReport,
  type AutoStopped,
  type GrowthStopAlert,
  type OfferTargetCheck,
} from './autostop';
export { withAppJobTx } from './db';
