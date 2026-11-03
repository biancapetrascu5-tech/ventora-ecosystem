'use client';

import { useLocale, useTranslations } from 'next-intl';
import type {
  AddonPurchaseLabels,
  AppTileLabels,
  DataTableLabels,
  PaymentLabels,
  UpgradeLabels,
  UsageMeterProps,
} from '@ventora/ui';

/** Etichetele DataTable + Pagination din cheile ui.* (textele S.* din design, 6 limbi). */
export function useDataTableLabels(): DataTableLabels {
  const t = useTranslations('ui');
  return {
    selectedN: (n) => t('selectedN', { n }),
    clearSelection: t('clearSelection'),
    selectAll: t('selectAll'),
    selectRow: t('selectRow'),
    sortAsc: t('sortAsc'),
    sortDesc: t('sortDesc'),
    rowActions: t('rowActions'),
    pagination: {
      range: (from, to, total) => t('rangeOf', { from, to, total }),
      pageOf: (n, total) => t('pageOf', { n, total }),
      rowsPerPage: t('rowsPerPage'),
      prevPage: t('prevPage'),
      nextPage: t('nextPage'),
    },
  };
}

/* Lotul 3.7 — etichetele componentelor de plată și de catalog din cheile pay.* (textele S.* din
   design, 6 limbi) și usageMeter.*. */

export function useUsageMeterLabels(): Partial<UsageMeterProps> {
  const t = useTranslations('usageMeter');
  const locale = useLocale();
  return {
    locale,
    unlimitedLabel: t('unlimited'),
    usedOfLabel: (a) => t('usedOf', a),
    leftLabel: (a) => t('left', a),
    nearLimitLabel: t('nearLimit'),
    atLimitLabel: t('atLimit'),
    atLimitHint: t('atLimitHint'),
    upgradeLabel: t('upgrade'),
    buyMoreLabel: t('buyMore'),
    notifyOwnerLabel: t('notifyOwner'),
    onlyOwnerBuysLabel: (a) => t('onlyOwnerBuys', a),
  };
}

export function usePaymentLabels(): PaymentLabels {
  const t = useTranslations('pay');
  return {
    expires: (date) => t('expires', { date }),
    changeCard: t('changeCard'),
    stripeSlot: t('stripeSlot'),
    saveCard: t('saveCard'),
    processingHint: t('processingHint'),
    paySuccessHint: t('paySuccessHint'),
    paySuccessHintPending: t('paySuccessHintPending'),
    invoicePending: t('invoicePending'),
    before: t('before'),
    after: t('after'),
    invoiceIssued: (nr) => t('invoiceIssued', { nr }),
    seeInvoice: t('seeInvoice'),
    payFailed: t('payFailed'),
    noMoneyTaken: t('noMoneyTaken'),
    whatYouCanDo: t('whatYouCanDo'),
    tryAgain: t('tryAgain'),
    useOtherCard: t('useOtherCard'),
    callBank: t('callBank'),
  };
}

export function useAddonPurchaseLabels(): AddonPurchaseLabels {
  const t = useTranslations('pay');
  return {
    ...usePaymentLabels(),
    processing: t('processing'),
    paySuccess: t('paySuccess'),
    payAmount: (amount) => t('payAmount', { amount }),
    done: t('done'),
    cancel: t('cancel'),
    quantity: t('quantity'),
    decrease: t('decrease'),
    increase: t('increase'),
    total: t('total'),
    payToday: t('payToday'),
    prorateToday: (amount, date) => t('prorateToday', { amount, date }),
    prorateThen: (amount) => t('prorateThen', { amount }),
    setupOnce: t('setupOnce'),
    prorateMaint: (amount, date) => t('prorateMaint', { amount, date }),
    addonIncludes: t('addonIncludes'),
    finalPrice: t('finalPrice'),
    payWith: t('payWith'),
    cardExpiring: t('cardExpiring'),
    noCardSaved: t('noCardSaved'),
    close: t('close'),
  };
}

export function useUpgradeLabels(): UpgradeLabels {
  const t = useTranslations('pay');
  return {
    ...usePaymentLabels(),
    chooseOption: t('chooseOption'),
    nothingLost: t('nothingLost'),
    decides: (who) => t('decides', { who }),
    recommendSent: (who) => t('recommendSent', { who }),
    recommendSend: t('recommendSend'),
    cancel: t('cancel'),
    continueBtn: t('continueBtn'),
    close: t('close'),
    back: t('back'),
    youActivate: t('youActivate'),
    whenLabel: t('whenLabel'),
    priceLabel: t('priceLabel'),
    setupCost: t('setupCost'),
    noneCost: t('noneCost'),
    payToday: t('payToday'),
    planRequestNote: t('planRequestNote'),
    trialNoCard: t('trialNoCard'),
    upgrade: t('upgrade'),
    startTrial: t('startTrial'),
    activating: t('activating'),
    processing: t('processing'),
    paySuccess: t('paySuccess'),
    trialActive: t('trialActive'),
    done: t('done'),
    payAmount: (amount) => t('payAmount', { amount }),
    payWith: t('payWith'),
    noCardSaved: t('noCardSaved'),
  };
}

export function useAppTileLabels(): AppTileLabels {
  const t = useTranslations('pay');
  const ui = useTranslations('ui');
  return {
    access: {
      available: t('access_available'),
      unavailable: t('access_unavailable'),
      notInRole: t('access_notInRole'),
      notInPlan: t('access_notInPlan'),
    },
    hintUnavailable: t('hint_unavailable'),
    hintNotInRole: (who) => t('hint_notInRole', { who }),
    hintNotInRoleNoOne: t('hint_notInRoleNoOne'),
    hintNotInPlan: t('hint_notInPlan'),
    requestAccess: t('requestAccess'),
    writeUs: t('writeUs'),
    seeStatus: t('seeStatus'),
    openApp: (app) => t('openApp', { app }),
    unreadN: (n) => ui('unreadN', { n }),
    seeDetails: t('seeDetails'),
    recommendation: t('recommendation'),
    remind: {
      moreOptions: t('moreOptions'),
      remindLater: t('remindLater'),
      remindWeek: t('remindWeek'),
      remindMonth: t('remindMonth'),
      notInterested: t('notInterested'),
    },
  };
}
