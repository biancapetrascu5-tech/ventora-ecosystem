import type * as React from 'react';

/** The six interface languages. */
export type Locale = 'ro' | 'en' | 'fr' | 'es' | 'de' | 'it';
/** Lucide icon name (release 0.460.0). */
export type IconName = string;
/** Forced visual state, for documentation and tests only. */
export type ForcedState = 'hover' | 'focus' | 'pressed';
/** The four status tones and their only meanings. */
export type Tone = 'neutral' | 'attention' | 'done' | 'danger';
export type AccessState = 'available' | 'unavailable' | 'notInRole' | 'notInPlan';
export type AppKey = 'booking' | 'crm' | 'documents' | 'contracts' | 'events' | 'hr' | 'inventory' | 'shifts' | 'marketing' | 'analytics' | 'assets' | 'projects' | 'finance' | 'portal' | 'network';

export interface Option<V = string | number> { value: V; label: string; description?: string; icon?: IconName; disabled?: boolean }
export interface OptionGroup<V = string | number> { label: string; options: Option<V>[] }

export interface VentoraProviderProps { locale?: Locale; theme?: 'light' | 'dark' | 'system'; manageTheme?: boolean; children?: React.ReactNode }
export declare function VentoraProvider(props: VentoraProviderProps): React.ReactElement;
export declare function LocaleProvider(props: { locale?: Locale; children?: React.ReactNode }): React.ReactElement;
export declare function useT(): (key: string, vars?: Record<string, string | number>) => string;
export declare function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string;
export declare function useTheme(): { theme: 'light' | 'dark' | 'system'; resolved: 'light' | 'dark'; setTheme(v: 'light' | 'dark' | 'system'): void };
export declare function useToast(): { toast(opts: ToastOptions): string; dismiss(id: string): void };
export declare function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, active?: boolean): void;

export interface IconProps { name: IconName; size?: number; strokeWidth?: number; label?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement | null;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: IconName; iconEnd?: IconName;
  loading?: boolean; block?: boolean; href?: string; state?: ForcedState;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName; label: string; variant?: 'quiet' | 'secondary' | 'primary'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; pressed?: boolean; badge?: number | boolean; state?: ForcedState;
}
export declare function IconButton(props: IconButtonProps): React.ReactElement;

export interface FormFieldProps { label?: React.ReactNode; helper?: React.ReactNode; error?: React.ReactNode; required?: boolean; optional?: boolean; labelHidden?: boolean; counter?: React.ReactNode; id?: string; children: React.ReactElement }
export declare function FormField(props: FormFieldProps): React.ReactElement;

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'sm' | 'md' | 'lg'; icon?: IconName; prefix?: React.ReactNode; suffix?: React.ReactNode; invalid?: boolean; loading?: boolean; clearable?: boolean; onClear?(): void; state?: ForcedState;
}
export declare function Input(props: InputProps): React.ReactElement;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean; showCount?: boolean; autoGrow?: boolean; state?: ForcedState }
export declare function Textarea(props: TextareaProps): React.ReactElement;

export interface SelectProps<V = string | number> { options: (Option<V> | OptionGroup<V>)[]; value?: V; defaultValue?: V; onChange?(v: V): void; placeholder?: string; invalid?: boolean; disabled?: boolean; loading?: boolean; size?: 'sm' | 'md' | 'lg'; icon?: IconName; defaultOpen?: boolean; id?: string; state?: ForcedState }
export declare function Select<V = string | number>(props: SelectProps<V>): React.ReactElement;

export interface ComboboxProps<V = string | number> { options: (Option<V> | OptionGroup<V>)[]; value?: V | V[] | null; defaultValue?: V | V[] | null; onChange?(v: V | V[] | null): void; multiple?: boolean; placeholder?: string; invalid?: boolean; disabled?: boolean; loading?: boolean; onQueryChange?(q: string): void; filter?: boolean; icon?: IconName | null; emptyText?: string; size?: 'sm' | 'md' | 'lg'; defaultOpen?: boolean; defaultQuery?: string; id?: string }
export declare function Combobox<V = string | number>(props: ComboboxProps<V>): React.ReactElement;

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> { label?: React.ReactNode; description?: React.ReactNode; checked?: boolean; defaultChecked?: boolean; indeterminate?: boolean; onChange?(checked: boolean): void; invalid?: boolean; state?: ForcedState }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;

export interface RadioProps { label?: React.ReactNode; description?: React.ReactNode; name?: string; value?: string | number; checked?: boolean; onChange?(): void; disabled?: boolean; invalid?: boolean; state?: ForcedState }
export declare function Radio(props: RadioProps): React.ReactElement;
export interface RadioGroupProps<V = string | number> { legend?: React.ReactNode; name?: string; options: Option<V>[]; value?: V; defaultValue?: V; onChange?(v: V): void; orientation?: 'vertical' | 'horizontal'; required?: boolean; error?: React.ReactNode; helper?: React.ReactNode; disabled?: boolean; invalid?: boolean }
export declare function RadioGroup<V = string | number>(props: RadioGroupProps<V>): React.ReactElement;

export interface ToggleProps { label?: React.ReactNode; description?: React.ReactNode; checked?: boolean; defaultChecked?: boolean; onChange?(on: boolean): void; disabled?: boolean; loading?: boolean; invalid?: boolean; labelPosition?: 'start' | 'end'; id?: string; state?: ForcedState }
export declare function Toggle(props: ToggleProps): React.ReactElement;

export interface SegmentedControlProps<V = string> { options: Option<V>[]; value?: V; defaultValue?: V; onChange?(v: V): void; label: string; size?: 'sm' | 'md'; block?: boolean; disabled?: boolean; iconOnly?: boolean }
export declare function SegmentedControl<V = string>(props: SegmentedControlProps<V>): React.ReactElement;

export interface DatePickerProps { mode?: 'date' | 'range' | 'time'; value?: Date | null | [Date | null, Date | null] | string; defaultValue?: DatePickerProps['value']; onChange?(v: any): void; placeholder?: string; min?: Date; max?: Date; isDisabled?(d: Date): boolean; step?: number; timeFrom?: string; timeTo?: string; today?: Date; invalid?: boolean; disabled?: boolean; size?: 'sm' | 'md' | 'lg'; open?: boolean; defaultOpen?: boolean; id?: string }
export declare function DatePicker(props: DatePickerProps): React.ReactElement;
export declare function Calendar(props: { mode?: 'date' | 'range'; value?: any; onChange(v: any): void; min?: Date; max?: Date; isDisabled?(d: Date): boolean; today?: Date }): React.ReactElement;

export interface UploadFile { id?: string | number; name: string; size?: number; status?: 'uploading' | 'done' | 'error'; progress?: number; error?: string }
export interface FileUploadProps { files?: UploadFile[]; onSelect?(files: File[]): void; onRemove?(f: UploadFile): void; onRetry?(f: UploadFile): void; accept?: string; multiple?: boolean; maxSize?: number; hint?: string; disabled?: boolean; invalid?: boolean; state?: ForcedState | 'drag'; id?: string }
export declare function FileUpload(props: FileUploadProps): React.ReactElement;

export interface TabItem { value: string; label: string; icon?: IconName; count?: number; countTone?: 'attention'; disabled?: boolean }
export interface TabsProps { items: TabItem[]; value?: string; defaultValue?: string; onChange?(v: string): void; label?: string; size?: 'sm' | 'md'; children?: React.ReactNode | ((value: string) => React.ReactNode) }
export declare function Tabs(props: TabsProps): React.ReactElement;

export interface PaginationProps { page: number; pageSize: number; total: number; onPageChange?(page: number): void; onPageSizeChange?(size: number): void; pageSizes?: number[]; compact?: boolean }
export declare function Pagination(props: PaginationProps): React.ReactElement;

export interface MenuItem { label?: string; icon?: IconName; description?: string; shortcut?: string[]; onSelect?(): void; disabled?: boolean; destructive?: boolean; checked?: boolean; separator?: boolean; heading?: string; render?: React.ReactNode }
export interface MenuProps { trigger: React.ReactElement; items: MenuItem[]; placement?: string; open?: boolean; defaultOpen?: boolean; onOpenChange?(o: boolean): void; label?: string; header?: React.ReactNode; width?: number | string }
export declare function Menu(props: MenuProps): React.ReactElement;

export interface Column<R> { key: string; header: React.ReactNode; render?(row: R): React.ReactNode; sortable?: boolean; align?: 'start' | 'end'; width?: number | string; primary?: boolean; secondary?: boolean; trailing?: boolean; muted?: boolean; /** hidden below 900px of table width */ optional?: boolean }
export interface DataTableProps<R = any> {
  columns: Column<R>[]; rows: R[]; rowKey?(row: R): string | number; sort?: { key: string; dir: 'asc' | 'desc' } | null; onSortChange?(s: { key: string; dir: 'asc' | 'desc' } | null): void;
  selectable?: boolean; selected?: (string | number)[]; onSelectedChange?(keys: (string | number)[]): void; rowActions?(row: R): MenuItem[];
  bulkActions?: { label: string; icon?: IconName; onClick?(): void; destructive?: boolean }[]; toolbar?: React.ReactNode; pagination?: PaginationProps;
  loading?: boolean; loadingRows?: number; empty?: React.ReactNode; onRowClick?(row: R): void; activeRow?: string | number; density?: 'default' | 'dense'; layout?: 'auto' | 'table' | 'list'; caption?: string;
}
export declare function DataTable<R = any>(props: DataTableProps<R>): React.ReactElement;

export type EventStatus = 'confirmed' | 'unconfirmed' | 'now' | 'done' | 'cancelled' | 'noshow' | 'blocked';
export interface ScheduleEvent { id: string; col: string; start: string; end: string; title: string; subtitle?: string; status?: EventStatus }
export declare function Schedule(props: { columns: { id: string; label: string; sub?: string; person?: string; today?: boolean; closed?: string }[]; events: ScheduleEvent[]; from?: number; to?: number; now?: string; nowColumn?: string; onEventClick?(e: ScheduleEvent): void; onSlotClick?(columnId: string, time: string): void; height?: number | string; minColumnWidth?: number; activeId?: string }): React.ReactElement;
export declare function Agenda(props: { items: { id: string; start: string; end: string; title: string; subtitle?: string; staff?: string; status?: EventStatus }[]; now?: string; onSelect?(item: any): void; activeId?: string; showStaff?: boolean }): React.ReactElement;
export declare function Stat(props: { label: string; value: React.ReactNode; unit?: string; delta?: { value: string; period?: string; direction?: 'up' | 'down'; good?: boolean }; hint?: string; icon?: IconName; tone?: 'neutral' | 'attention'; onClick?(): void }): React.ReactElement;
export interface KanbanColumn { id: string; label: string; summary?: string; count?: number; tone?: 'done'; empty?: string }
export interface KanbanCardProps { id: string; col: string; title: string; subtitle?: string; tag?: string; amount?: string; people?: string[]; due?: { label: string; tone?: 'neutral' | 'attention' | 'done' | 'danger'; icon?: IconName }; meta?: string[]; progress?: { done: number; total: number }; onOpen?(): void; onMove?(id: string, col: string): void; columns?: KanbanColumn[]; active?: boolean }
export declare function Kanban(props: { columns: KanbanColumn[]; cards: KanbanCardProps[]; renderCard?(card: KanbanCardProps, ctx: { columns: KanbanColumn[]; onMove?(id: string, col: string): void }): React.ReactNode; onMove?(id: string, col: string): void; defaultColumn?: string; label?: string }): React.ReactElement;
export declare function KanbanCard(props: KanbanCardProps): React.ReactElement;
export declare function Timeline(props: { periods: { label: string; current?: boolean }[]; rows: ({ id: string; label: string; sub?: string; start: number; end: number; status?: 'planned' | 'active' | 'late' | 'done'; progress?: number; statusLabel?: string } | { id: string; label: string; sub?: string; milestone: number; milestoneLabel?: string })[]; today?: number; label?: string; minPeriodWidth?: number }): React.ReactElement;
export declare function BarChart(props: { data: { label: string; value: number; compare?: number; now?: boolean; nowLabel?: string; share?: string }[]; orientation?: 'vertical' | 'horizontal'; title: string; description?: string; unit?: string; format?(v: number): string; compareLabel?: string; color?: 1 | 2 | 3 | 4 | 5; height?: number; actions?: React.ReactNode }): React.ReactElement;
export declare function LineChart(props: { labels: string[]; series: { label: string; values: (number | null)[]; color?: 1 | 2 | 3 | 4 | 5 | 'compare' }[]; nowIndex?: number; nowLabel?: string; title: string; description?: string; unit?: string; format?(v: number): string; height?: number; area?: boolean; actions?: React.ReactNode }): React.ReactElement;
export declare function RecommendationLabel(props?: { className?: string }): React.ReactElement;
export declare function GrowthSlot(props: { children?: React.ReactNode; label?: string }): React.ReactElement | null;
export declare function RecommendationCard(props: { app?: AppKey; icon?: IconName; title: string; benefit?: string; cost?: string; role?: 'owner' | 'member'; actionLabel?: string; actionIcon?: IconName; onAction?(): void; decider?: string; onRecommend?(): void; recommended?: boolean; status?: 'pending' | 'activated' | 'declined'; onDismiss?(): void; onRemindLater?(period: 'week' | 'month'): void; proactive?: boolean }): React.ReactElement;
export interface UpgradeOption { id: string; kind: 'pack' | 'plan' | 'trial' | 'app' | 'bundle'; title: string; price: string; includes?: string[] }
export declare function UpgradeDialog(props: { open?: boolean; onOpenChange?(o: boolean): void; inline?: boolean; sheet?: boolean; title?: string; description?: string; usage?: { label: string; used: number; limit: number; unit?: string }; options: UpgradeOption[]; value?: string; onChange?(id: string): void; role?: 'owner' | 'member'; decider?: string; onRecommend?(): void; recommended?: boolean; step?: 'options' | 'confirm' | 'processing' | 'success' | 'error' | 'trial'; summary?: { what?: string; when?: string; price?: string; setup?: string; total?: string }; card?: { brand: string; last4: string; expiry?: string } | null; cardSlot?: React.ReactNode; error?: { title?: string; message?: string }; success?: { title?: string; hint?: string; usage?: { label: string; used: number; limitBefore: number; limitAfter: number }; invoice?: { number: string; onOpen?(): void } }; trial?: { text: string; reminder?: string }; onContinue?(id: string): void; onBack?(): void; onPay?(): void; onRetry?(): void; onUseOtherCard?(): void; onDone?(): void; doneLabel?: string }): React.ReactElement;
export declare function DiscoveryTooltip(props: { open?: boolean; title: string; body?: string; onGotIt?(): void; onLearnMore?(): void; placement?: 'bottom' | 'top'; align?: 'start' | 'end'; commercial?: boolean; children: React.ReactNode }): React.ReactElement;
export interface RuleCriterion { value: string; label: string; operators: string[]; values?: (string | { value: string; label: string })[]; unit?: string }
export interface Rule { id: string; criterion: string; operator: string; value: string }
/** Eligibility rules for a campaign: only the criteria passed in exist as options; shows the estimated count, never who. */
export declare function RuleBuilder(props: { criteria: RuleCriterion[]; rules?: Rule[]; match?: 'all' | 'any'; onChange?(rules: Rule[]): void; onMatchChange?(m: 'all' | 'any'): void; estimate?: number; className?: string }): React.ReactElement;
export declare function HubRecommendation(props: { r: { id: string; kind?: 'team'; app?: AppKey; icon?: IconName; title: string; body?: string; note?: string }; onOpen?(r: any): void; onDismiss?(r: any): void; onSeeApp?(r: any): void; onReject?(r: any): void }): React.ReactElement;
export declare function SlotPicker(props: { slots: { time: string; available?: boolean }[]; value?: string; onChange?(time: string): void; label?: string }): React.ReactElement;
export declare function AttentionList(props: { items: { id: string | number; icon?: IconName; tone?: 'danger'; title: React.ReactNode; meta?: React.ReactNode; time?: string; actions?: { label: string; icon?: IconName; primary?: boolean; quiet?: boolean; onClick?(): void }[] }[]; empty?: React.ReactNode }): React.ReactElement | null;
export declare function StatusPill(props: { tone?: Tone; icon?: IconName | false; size?: 'sm' | 'md'; children: React.ReactNode }): React.ReactElement;
export declare function StatusDot(props: { tone?: Tone | 'offline'; label?: string; hideLabel?: boolean }): React.ReactElement;
export declare function Badge(props: { tone?: 'neutral' | 'attention' | 'primary'; count?: number; max?: number; dot?: boolean; label?: string; children?: React.ReactNode }): React.ReactElement;
export interface AvatarProps { name: string; src?: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; shape?: 'circle' | 'square'; status?: Tone | 'offline' }
export declare function Avatar(props: AvatarProps): React.ReactElement;
export declare function AvatarGroup(props: { people: { name: string; src?: string }[]; max?: number; size?: AvatarProps['size'] }): React.ReactElement;
export declare function Skeleton(props: { width?: number | string; height?: number | string; shape?: 'line' | 'block' | 'circle' }): React.ReactElement;
export declare function SkeletonText(props: { lines?: number }): React.ReactElement;
export declare function ProgressBar(props: { value?: number; label?: string; showValue?: boolean; size?: 'sm' | 'md' | 'lg'; tone?: 'default' | 'done' }): React.ReactElement;
export interface UsageMeterProps { label: string; used: number; limit?: number; unit?: string; warnAt?: number; /** request a plan change */ onUpgrade?(): void; /** owner buys an add-on */ onBuy?(): void; buyLabel?: string; /** non-owner: the owner's name, shown as who can buy */ owner?: string; onNotifyOwner?(): void; compact?: boolean; format?(n: number): string }
export declare function UsageMeter(props: UsageMeterProps): React.ReactElement;
export declare function EmptyState(props: { icon?: IconName; title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; size?: 'sm' | 'md' }): React.ReactElement;
export declare function Kbd(props: { keys: string[] }): React.ReactElement;

export declare function Tooltip(props: { content: React.ReactNode; shortcut?: string[]; placement?: string; delay?: number; open?: boolean; children: React.ReactElement }): React.ReactElement;
export interface DialogProps { open: boolean; onOpenChange?(o: boolean): void; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; size?: 'md' | 'wide'; tone?: 'default' | 'danger' | 'attention'; icon?: IconName; dismissible?: boolean; initialFocus?: React.RefObject<HTMLElement> }
export declare function Dialog(props: DialogProps & { inline?: boolean; className?: string }): React.ReactElement | null;
export interface DrawerProps { /** render inside the nearest positioned parent (docs, split views) */ contained?: boolean; /** force a layout instead of following the viewport */ layout?: 'auto' | 'side' | 'full'; open: boolean; onOpenChange?(o: boolean): void; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; width?: number | string; modal?: boolean }
export declare function Drawer(props: DrawerProps): React.ReactElement | null;
export interface ToastOptions { title: React.ReactNode; description?: React.ReactNode; tone?: Tone; onUndo?(): void; action?: { label: string; onClick?(): void }; duration?: number; loading?: boolean }
export declare function Toast(props: ToastOptions & { onDismiss?(): void }): React.ReactElement;
export declare function ToastProvider(props: { children?: React.ReactNode; duration?: number }): React.ReactElement;
export interface CommandItem { id?: string; label: string; description?: string; icon?: IconName; shortcut?: string[]; keywords?: string; onSelect?(): void }
export declare function CommandPalette(props: { open: boolean; onOpenChange?(o: boolean): void; groups: { label: string; items: CommandItem[] }[]; placeholder?: string; onQueryChange?(q: string): void; loading?: boolean; inline?: boolean }): React.ReactElement | null;

export declare function ThemeSwitcher(props: { value?: 'light' | 'dark' | 'system'; onChange?(v: 'light' | 'dark' | 'system'): void; iconOnly?: boolean; size?: 'sm' | 'md'; block?: boolean }): React.ReactElement;
export declare function LanguageSwitcher(props: { value?: Locale; onChange?(code: Locale): void; variant?: 'button' | 'icon'; placement?: string; defaultOpen?: boolean }): React.ReactElement;

export interface NavItem { id: string; label: string; /** short label for the phone bottom bar */ short?: string; icon: IconName; badge?: number | string; badgeTone?: 'attention' | 'neutral'; href?: string; onClick?(e: React.MouseEvent): void; disabled?: boolean }
export declare function AppShell(props: { spine?: React.ReactNode; contextBar?: React.ReactNode; children?: React.ReactNode; height?: number | string }): React.ReactElement;
export declare function Spine(props: { app?: AppKey; hub?: boolean; appName?: string; appIcon?: IconName; sections: { label?: string; items: NavItem[] }[]; activeId?: string; onNavigate?(item: NavItem): void; onBackToHub?(): void; footer?: React.ReactNode; collapsed?: boolean; defaultCollapsed?: boolean; onCollapsedChange?(c: boolean): void; bottomItems?: string[] }): React.ReactElement;
export declare function ContextBar(props: { title?: React.ReactNode; org?: React.ReactNode; onSearch?(): void; searchLabel?: string; createItems?: MenuItem[]; onCreate?(): void; createLabel?: string; notifications?: React.ReactNode; account?: React.ReactNode; leading?: React.ReactNode }): React.ReactElement;
export declare function PageHeader(props: { title: React.ReactNode; description?: React.ReactNode; breadcrumbs?: { label: string; href?: string; onClick?(): void }[]; actions?: React.ReactNode; meta?: React.ReactNode; tabs?: React.ReactNode }): React.ReactElement;
export declare function Sheet(props: { children?: React.ReactNode; padded?: boolean; as?: keyof JSX.IntrinsicElements } & React.HTMLAttributes<HTMLElement>): React.ReactElement;
export declare function SheetSection(props: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }): React.ReactElement;

/** The official logo files, unchanged (light + dark variant B). */
export declare function Logo(props: { variant?: 'full' | 'mark'; size?: number; title?: string; className?: string }): React.ReactElement;
/** The light and dark (variant B) marks as SVG data URLs. */
export declare const LOGO_MARK: string;
export declare const LOGO_MARK_DARK: string;
/** One of the 15 custom app icons; `muted` = inactive variant; theme handled by appicon-* tokens. */
export declare function AppIcon(props: { app?: AppKey; icon?: IconName; size?: number; muted?: boolean; title?: string }): React.ReactElement;
export declare const APPS: Record<AppKey, { name: string; icon: IconName }>;
export declare function AccessBadge(props: { state: AccessState }): React.ReactElement;
export interface AppTileProps { layout?: 'tile' | 'icon' | 'row'; app?: AppKey; name?: string; description?: string; icon?: IconName; access?: AccessState; reason?: string; grantedBy?: string; onOpen?(e: React.MouseEvent, name: string): void; onRequestAccess?(): void; onWriteUs?(): void; onSeeStatus?(): void; badge?: number; state?: ForcedState; recommendation?: { reason: string; cost?: string }; onDetails?(): void; onDismiss?(): void; onRemindLater?(period: 'week' | 'month'): void }
export declare function AppTile(props: AppTileProps): React.ReactElement;
export interface PaymentCardData { brand: string; last4: string; expiry?: string }
export declare function PaymentCard(props: { card: PaymentCardData; onChange?(): void; compact?: boolean }): React.ReactElement | null;
export declare function StripeSlot(props: { children?: React.ReactNode; saveCard?: boolean; onSaveCardChange?(v: boolean): void }): React.ReactElement;
export interface AddonPurchaseProps { open?: boolean; onOpenChange?(o: boolean): void; inline?: boolean; sheet?: boolean; addon: { name: string; title?: string; description?: string; price: number; icon?: IconName; max?: number; note?: string }; quantity?: number; defaultQuantity?: number; onQuantityChange?(q: number): void; card?: PaymentCardData | null; onChangeCard?(): void; cardSlot?: React.ReactNode; state?: 'review' | 'processing' | 'success' | 'error'; error?: { title?: string; message?: string }; usage?: { label: string; used: number; limitBefore: number; limitAfter: number; unit?: string }; invoice?: { number: string; onOpen?(): void }; onPay?(quantity: number, total: number): void; onRetry?(): void; onUseOtherCard?(): void; onDone?(): void; currency?: string; format?(n: number): string }
export declare function AddonPurchase(props: AddonPurchaseProps): React.ReactElement | null;
type Box = DOMRect | { left: number; top: number; width: number; height: number };
/** Opening an app (v2, direction B): the app grows out of the tapped card; `waiting` keeps icon + name centred until the app is ready. */
export declare function AppLaunch(props: { app: AppKey; name?: string; from?: Box; fromCard?: Box; iconEl?: Element; fromLocal?: { left: number; top: number; width: number; height: number }; onDone?(): void; contained?: boolean; progress?: number; waiting?: boolean }): React.ReactElement;
/** A brand zone — Hub only (launcher bar and band, sign-in panel): brand-surface ground, everything inside rendered dark. */
export declare function BrandZone(props: { as?: keyof JSX.IntrinsicElements; className?: string; style?: React.CSSProperties; children?: React.ReactNode; [attr: string]: unknown }): React.ReactElement;
export interface DockApp { app: AppKey; name?: string; icon?: IconName; description?: string; badge?: number; live?: { text: string; attention?: boolean } }
/** The launcher's "Aplicațiile tale": a row of icons; hover / focus opens the app's card above the row. Phones: icon grid. */
export declare function AppDock(props: { apps: DockApp[]; onOpen?(e: React.MouseEvent, app: AppKey, name: string, launch: { from: DOMRect; fromCard: DOMRect; iconEl: Element }): void; label?: string; className?: string }): React.ReactElement;
/** Portal in the business launcher: the business page for clients, with "Gestionează pagina" and "Vezi cum arată în Portal". */
export declare function PortalPresence(props: { status?: 'published' | 'hidden' | 'draft'; canManage?: boolean; onManage?(): void; onPreview?(): void; previewHref?: string; compact?: boolean; className?: string }): React.ReactElement;
export declare function Notice(props: { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; icon?: IconName; actions?: React.ReactNode }): React.ReactElement;
export interface Org { id: string | number; name: string; role?: string }
export declare function OrgSwitcher(props: { orgs: Org[]; currentId?: Org['id']; onChange?(id: Org['id']): void; compact?: boolean; defaultOpen?: boolean }): React.ReactElement;
export interface Notification { id: string | number; title: string; body?: string; app?: string; time?: string; person?: string; icon?: IconName; read?: boolean }
export declare function NotificationsPanel(props: { items: Notification[]; onOpenItem?(n: Notification): void; onMarkAllRead?(): void; onSettings?(): void; inline?: boolean; open?: boolean; onOpenChange?(o: boolean): void }): React.ReactElement;
export declare function AccountMenu(props: { user: { name: string; email?: string; avatar?: string }; onProfile?(): void; onSupport?(): void; onCatalog?(): void; onSignOut?(): void; theme?: 'light' | 'dark' | 'system'; onThemeChange?(v: 'light' | 'dark' | 'system'): void; locale?: Locale; onLocaleChange?(c: Locale): void; orgs?: Org[]; currentOrgId?: Org['id']; onOrgChange?(id: Org['id']): void; placement?: string; defaultOpen?: boolean }): React.ReactElement;

declare global { interface Window { Ventora: Record<string, any> } }
