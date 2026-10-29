import type {
  AccountMenuLabels,
  AddonPurchaseLabels,
  UpgradeLabels,
  ContextBarLabels,
  PaymentLabels,
  OrgSwitcherLabels,
  ThemeSwitcherLabels,
  ChartLabels,
  DataTableLabels,
  DatePickerLabels,
  FileUploadLabels,
  KanbanLabels,
  NotificationsLabels,
  PaginationLabels,
  ScheduleStatusLabels,
  SpineLabels,
  AccessLabels,
  RemindLabels,
  RecommendationCardLabels,
  AppTileLabels,
  DiscoveryTooltipLabels,
  PortalPresenceLabels,
  RuleBuilderLabels,
} from '@ventora/ui';
import ro from '@ventora/i18n/messages/ro.json';

// Textele RO din bundle.js (S.rangeOf, S.pageOf, S.rowsPerPage, S.prevPage, S.nextPage)
export const PAGINATION_RO: PaginationLabels = {
  range: (from, to, total) => `${from}–${to} din ${total}`,
  pageOf: (n, total) => `Pagina ${n} din ${total}`,
  rowsPerPage: 'Rânduri pe pagină',
  prevPage: 'Pagina anterioară',
  nextPage: 'Pagina următoare',
};

// S.viewTable, S.viewChart și sufixul „mil.” din compact() (bundle.js)
export const CHART_RO: ChartLabels = {
  viewTable: 'Vezi ca tabel',
  viewChart: 'Vezi graficul',
  millions: 'mil.',
};

// S.selectedN (cu plural), S.clearSelection, S.selectAll, S.selectRow, S.sortAsc, S.sortDesc, S.rowActions
const RO_PLURAL = new Intl.PluralRules('ro-RO');
const SELECTED_RO = { one: 'selectat', few: 'selectate', other: 'de selectate' } as const;
export const DATATABLE_RO: DataTableLabels = {
  selectedN: (n) => {
    const form = RO_PLURAL.select(n);
    return `${n} ${form === 'one' || form === 'few' ? SELECTED_RO[form] : SELECTED_RO.other}`;
  },
  clearSelection: 'Renunță la selecție',
  selectAll: 'Selectează toate rândurile',
  selectRow: 'Selectează rândul',
  sortAsc: 'Sortat crescător',
  sortDesc: 'Sortat descrescător',
  rowActions: 'Acțiuni',
  pagination: PAGINATION_RO,
};

// S.dropFiles, S.dropNow, S.browse, S.maxSize, S.uploaded, S.retry, S.remove (bundle.js)
export const UPLOAD_RO: FileUploadLabels = {
  dropFiles: 'Trage fișierele aici sau',
  dropNow: 'Dă drumul ca să încarci',
  browse: 'alege-le de pe dispozitiv',
  maxSize: (size) => `Până la ${size} de fiecare fișier`,
  uploaded: 'Încărcat',
  retry: 'Încearcă din nou',
  remove: 'Elimină',
};

// UsageMeter: textele din packages/i18n (usageMeter.*), ca în galeria UsageMeter
const tpl = (str: string, args: Record<string, string>) =>
  Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
export const USAGE_RO = {
  locale: 'ro',
  unlimitedLabel: ro.usageMeter.unlimited,
  usedOfLabel: (a: { used: string; limit: string }) => tpl(ro.usageMeter.usedOf, a),
  leftLabel: (a: { n: string }) => tpl(ro.usageMeter.left, a),
  nearLimitLabel: ro.usageMeter.nearLimit,
  atLimitLabel: ro.usageMeter.atLimit,
  atLimitHint: ro.usageMeter.atLimitHint,
  upgradeLabel: ro.usageMeter.upgrade,
  buyMoreLabel: ro.usageMeter.buyMore,
  notifyOwnerLabel: ro.usageMeter.notifyOwner,
  onlyOwnerBuysLabel: (a: { who: string }) => tpl(ro.usageMeter.onlyOwnerBuys, a),
};

// S.backToHub, S.expandMenu, S.collapseMenu, S.more, S.close, S.back (ro)
export const SPINE_RO: SpineLabels = {
  backToHub: 'Înapoi la aplicații',
  expandMenu: 'Extinde meniul',
  collapseMenu: 'Restrânge meniul',
  more: 'Mai multe',
  close: 'Închide',
  back: 'Înapoi',
};

// S.chooseDate, S.chooseTime, S.chooseRange, S.prevMonth, S.nextMonth, S.today, S.clearChoice (ro)
export const DATEPICKER_RO: DatePickerLabels = {
  chooseDate: 'Alege data',
  chooseTime: 'Alege ora',
  chooseRange: 'Alege intervalul',
  prevMonth: 'Luna anterioară',
  nextMonth: 'Luna următoare',
  today: 'Azi',
  clearChoice: 'Șterge alegerea',
};

// S.moveTo, S.moreActionsFor, S.rowActions (ro)
export const KANBAN_RO: KanbanLabels = {
  moveTo: (col) => `Mută în „${col}”`,
  moreActionsFor: (name) => `Acțiuni pentru ${name}`,
  rowActions: 'Acțiuni',
};

// S.ev_* (ro) — stările programărilor (Schedule, Agenda)
export const EVENT_STATUS_RO: ScheduleStatusLabels = {
  done: 'Încheiată',
  now: 'În desfășurare',
  confirmed: 'Confirmată',
  unconfirmed: 'Neconfirmată',
  noshow: 'Nu a venit',
  cancelled: 'Anulată',
  blocked: 'Blocat',
};

// Lotul 7 — S.themeLight/Dark/System, S.switchBusiness, S.yourBusinesses, S.findBusiness,
// S.account, S.theme, S.language, S.allApps, S.support, S.signOut (ro)
export const THEME_RO: ThemeSwitcherLabels = {
  theme: 'Temă',
  light: 'Luminoasă',
  dark: 'Întunecată',
  system: 'Automată',
};
export const ORG_RO: OrgSwitcherLabels = {
  switchBusiness: 'Schimbă afacerea',
  yourBusinesses: 'Afacerile tale',
  findBusiness: 'Caută o afacere…',
  noResultsFor: (q) => `Niciun rezultat pentru „${q}”`,
};
export const ACCOUNT_RO: AccountMenuLabels = {
  account: 'Contul tău',
  yourBusinesses: 'Afacerile tale',
  theme: 'Temă',
  language: 'Limbă',
  allApps: 'Toate aplicațiile Ventora',
  support: 'Suport',
  signOut: 'Ieși din cont',
  themeSwitcher: THEME_RO,
  orgSwitcher: ORG_RO,
};

// S.notifications … S.notInterested (ro) — NotificationsPanel + HubRecommendation
export const NOTIF_RO: NotificationsLabels = {
  notifications: 'Notificări',
  unreadN: (n) => `${n} necitite`,
  markAllRead: 'Marchează toate ca citite',
  notificationSettings: 'Setări notificări',
  all: 'Toate',
  unread: 'Necitite',
  noNotifications: 'Nu ai notificări noi',
  noNotificationsHint: 'Îți spunem aici când ceva are nevoie de tine.',
  operational: 'Despre cont și funcționare',
  activity: 'Activitate',
  recommendations: 'Recomandări',
  recommendation: 'Recomandare',
  fromTeam: 'Recomandare de la echipă',
  seeApp: 'Vezi aplicația',
  reject: 'Respinge',
  seeDetails: 'Vezi detaliile',
  notInterested: 'Nu mă interesează',
};

// S.* plăți (ro) — AddonPurchase, UpgradeDialog
export const PAYMENT_RO: PaymentLabels = {
  expires: (date) => `expiră ${date}`,
  changeCard: 'Schimbă cardul',
  stripeSlot: 'Formular securizat Stripe: număr card, expirare, CVC',
  saveCard: 'Păstrează cardul pentru plățile următoare',
  processingHint: 'Nu închide fereastra. Durează doar câteva secunde.',
  paySuccessHint: 'Limita a crescut deja. Ți-am trimis factura și pe e-mail.',
  before: 'Înainte',
  after: 'Acum',
  invoiceIssued: (nr) => `Am emis factura ${nr}`,
  seeInvoice: 'Vezi factura',
  payFailed: 'Plata nu a trecut',
  noMoneyTaken: 'Nu ți s-a retras niciun ban de pe card.',
  whatYouCanDo: 'Ce poți face',
  tryAgain: 'Încearcă din nou',
  useOtherCard: 'Folosește alt card',
  callBank: 'Dacă se repetă, sună la bancă: uneori blochează plățile online noi.',
};
export const ADDON_RO: AddonPurchaseLabels = {
  ...PAYMENT_RO,
  processing: 'Procesăm plata…',
  paySuccess: 'Plata a reușit',
  payAmount: (amount) => `Plătește ${amount}`,
  done: 'Gata',
  cancel: 'Renunță',
  quantity: 'Cantitate',
  decrease: 'Scade cantitatea',
  increase: 'Crește cantitatea',
  total: 'Total',
  finalPrice: 'Prețul e final, nu se adaugă TVA.',
  payWith: 'Plătești cu cardul',
  cardExpiring: 'Cardul expiră luna aceasta. Poți plăti cu el acum sau îl schimbi.',
  noCardSaved: 'Afacerea nu are încă un card salvat.',
  close: 'Închide',
};

// S.chooseOption… din bundle.js (UpgradeDialog)
export const UPGRADE_RO: UpgradeLabels = {
  ...PAYMENT_RO,
  chooseOption: 'Alege ce ți se potrivește',
  nothingLost: 'Nu se pierde nimic din ce ai.',
  decides: (who) => `Ajunge la ${who}.`,
  recommendSent: (who) => `Am trimis recomandarea către ${who}.`,
  recommendSend: 'Recomandă',
  cancel: 'Renunță',
  continueBtn: 'Continuă',
  close: 'Închide',
  back: 'Înapoi',
  youActivate: 'Ce activezi',
  whenLabel: 'Când',
  priceLabel: 'Preț',
  setupCost: 'Cost de implementare',
  noneCost: 'Fără',
  payToday: 'Plătești azi',
  planRequestNote:
    'Nu plătești nimic acum. Îți confirmăm noul abonament și prețul înainte să-l pornim, în cel mult o zi lucrătoare.',
  trialNoCard:
    'Nu ai nevoie de card. La final aplicația se oprește, datele rămân, iar continuarea e alegerea ta.',
  upgrade: 'Cere alt abonament',
  startTrial: 'Începe perioada de probă',
  activating: 'Activăm…',
  processing: 'Procesăm plata…',
  paySuccess: 'Plata a reușit',
  trialActive: 'Perioada de probă a început',
  done: 'Gata',
  payAmount: (amount) => `Plătește ${amount}`,
  payWith: 'Plătești cu cardul',
  noCardSaved: 'Afacerea nu are încă un card salvat.',
};

// S.search / S.searchPlaceholder / S.create din bundle.js (ContextBar)
export const CONTEXTBAR_RO: ContextBarLabels = {
  search: 'Caută',
  searchPlaceholder: 'Caută…',
  create: 'Creează',
};

// S.access_* din bundle.js (AccessBadge, AppTile)
export const ACCESS_RO: AccessLabels = {
  available: 'Disponibilă',
  unavailable: 'Temporar indisponibilă',
  notInRole: 'Nu e în rolul tău',
  notInPlan: 'Nu e în abonament',
};

// S.moreOptions / S.remindLater / S.remindWeek / S.remindMonth / S.notInterested (RemindMenu)
export const REMIND_RO: RemindLabels = {
  moreOptions: 'Mai multe opțiuni',
  remindLater: 'Amintește-mi mai târziu',
  remindWeek: 'Peste o săptămână',
  remindMonth: 'Peste o lună',
  notInterested: 'Nu mă interesează',
};

// RecommendationCard
export const RECO_RO: RecommendationCardLabels = {
  recommendation: 'Recomandare',
  recommendSend: 'Recomandă',
  decides: (who) => `Ajunge la ${who}.`,
  recommendSent: (who) => `Am trimis recomandarea către ${who}.`,
  recoActivated: 'Activată',
  recoDeclined: 'Nu acum',
  recoPending: 'În așteptare',
  remind: REMIND_RO,
};

// AppTile
export const APPTILE_RO: AppTileLabels = {
  access: ACCESS_RO,
  hintUnavailable: 'Lucrăm la ea acum. Revine în curând.',
  hintNotInRole: (who) => `Rolul tău nu include această aplicație. ${who} îți poate da acces.`,
  hintNotInRoleNoOne:
    'Rolul tău nu include această aplicație. Proprietarul afacerii îți poate da acces.',
  hintNotInPlan: 'Nu e inclusă în abonamentul afacerii. Scrie-ne și o activăm.',
  requestAccess: 'Cere acces',
  writeUs: 'Scrie-ne',
  seeStatus: 'Vezi starea',
  openApp: (app) => `Deschide ${app}`,
  unreadN: (n) => `${n} necitite`,
  seeDetails: 'Vezi detaliile',
  recommendation: 'Recomandare',
  remind: REMIND_RO,
};

// DiscoveryTooltip
export const DISCO_RO: DiscoveryTooltipLabels = {
  gotIt: 'Am înțeles',
  seeHow: 'Vezi cum funcționează',
  recommendation: 'Recomandare',
};

// PortalPresence (S.portal_*)
export const PORTAL_RO: PortalPresenceLabels = {
  eyebrow: 'Portal · pentru clienții tăi',
  title: 'Pagina afacerii în Portal',
  description:
    'Clienții te găsesc în Portal și își fac programări acolo. De aici schimbi ce văd ei.',
  noManage: 'Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal.',
  manage: 'Gestionează pagina',
  finish: 'Termină pagina',
  preview: 'Vezi cum arată în Portal',
  newTab: 'se deschide într-un tab nou',
  published: 'Publicată',
  hidden: 'Ascunsă',
  draft: 'Nu e publicată încă',
};

// S.launch_opening (AppLaunch)
export const LAUNCH_RO = (app: string) => `Se deschide ${app}`;

// RuleBuilder (S.matchLabel, S.ruleN, S.eligibleN…)
export const RULES_RO: RuleBuilderLabels = {
  matchLabel: 'Afacerea trebuie să îndeplinească',
  matchAll: 'Toate condițiile',
  matchAny: 'Oricare dintre ele',
  ruleN: (n) => `Condiția ${n}`,
  criterion: 'Criteriu',
  operator: 'Condiție',
  value: 'Valoare',
  removeCondition: 'Șterge condiția',
  addCondition: 'Adaugă o condiție',
  // S.eligibleN are forme de plural (one / few / other): 1 afacere, 2–19 afaceri, 20+ „de afaceri”
  eligibleN: (n) =>
    ({
      one: `Aproximativ ${n} afacere eligibilă`,
      few: `Aproximativ ${n} afaceri eligibile`,
    })[new Intl.PluralRules('ro').select(n) as 'one' | 'few'] ??
    `Aproximativ ${n} de afaceri eligibile`,
};
