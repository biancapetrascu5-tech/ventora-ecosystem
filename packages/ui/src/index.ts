// Provider
export { VentoraProvider } from './provider/VentoraProvider';
export { useTheme } from './provider/useTheme';
export type { Theme } from './provider/ThemeContext';

// Hooks
export { useHotkey } from './provider/useHotkey';
export { useToast } from './hooks/useToast';

// Primitives
export { Icon } from './Icon/Icon';
export type { IconProps, IconName, IconSize } from './Icon/Icon';

export { Button } from './Button/Button';
export type { ButtonProps } from './Button/Button';

export { IconButton } from './IconButton/IconButton';
export type { IconButtonProps, IconButtonVariant } from './IconButton/IconButton';

export { Input } from './Input/Input';
export type { InputProps, InputLabels } from './Input/Input';

export { Textarea } from './Textarea/Textarea';
export type { TextareaProps } from './Textarea/Textarea';

export { Select } from './Select/Select';
export type { SelectProps, SelectOption, SelectOptionGroup } from './Select/Select';

export { Checkbox } from './Checkbox/Checkbox';
export type { CheckboxProps } from './Checkbox/Checkbox';

export { Radio, RadioGroup } from './Radio/Radio';
export type { RadioProps, RadioGroupProps } from './Radio/Radio';

export { Toggle } from './Toggle/Toggle';
export type { ToggleProps } from './Toggle/Toggle';

export { FormField } from './FormField/FormField';
export type { FormFieldProps } from './FormField/FormField';

export { SegmentedControl } from './SegmentedControl/SegmentedControl';
export type {
  SegmentedControlProps,
  SegmentedControlOption,
} from './SegmentedControl/SegmentedControl';

export { FileUpload } from './FileUpload/FileUpload';
export { fmtSize } from './FileUpload/FileUpload';
export type { FileUploadProps, FileUploadLabels, UploadFile } from './FileUpload/FileUpload';

export { Combobox } from './Combobox/Combobox';
export type {
  ComboboxProps,
  ComboboxOption,
  ComboboxOptionGroup,
  ComboboxLabels,
} from './Combobox/Combobox';

// Navigation & Overlay (Lot 3)
export { Tabs } from './Tabs/Tabs';
export type { TabsProps, TabItem } from './Tabs/Tabs';

export { Pagination } from './Pagination/Pagination';
export { pageList } from './Pagination/Pagination';
export type { PaginationProps, PaginationLabels } from './Pagination/Pagination';

export { Menu } from './Menu/Menu';
export type { MenuProps, MenuItemDef, MenuSectionDef, MenuEntry } from './Menu/Menu';

export { Tooltip, TooltipBubble } from './Tooltip/Tooltip';
export type { TooltipProps } from './Tooltip/Tooltip';

export { Dialog, DialogTrigger, DialogHeader, DialogBody, DialogFooter } from './Dialog/Dialog';
export type { DialogProps, DialogTone } from './Dialog/Dialog';

export { Drawer, DrawerTrigger, DrawerHeader, DrawerBody, DrawerFooter } from './Drawer/Drawer';
export type { DrawerProps } from './Drawer/Drawer';

export { CommandPalette } from './CommandPalette/CommandPalette';
export type {
  CommandPaletteProps,
  CommandDef,
  CommandGroup,
  CommandPaletteLabels,
} from './CommandPalette/CommandPalette';

export { Sheet, SheetSection } from './Sheet/Sheet';
export type { SheetProps, SheetSectionProps } from './Sheet/Sheet';

export { PageHeader } from './PageHeader/PageHeader';
export type { PageHeaderProps, Breadcrumb } from './PageHeader/PageHeader';

export { ContextBar } from './ContextBar/ContextBar';
export type { ContextBarProps, ContextBarLabels } from './ContextBar/ContextBar';

export { Spine } from './Spine/Spine';
export type { SpineProps, NavItem, NavSection, SpineLabels } from './Spine/Spine';

export { AppShell } from './AppShell/AppShell';
export type { AppShellProps } from './AppShell/AppShell';

// App icons (Lot 4 demo — Lot 7 va migra la inline SVG)
export { AppIcon, APPS, APP_IDS } from './AppIcon/AppIcon';
export type { AppIconProps, AppName } from './AppIcon/AppIcon';

// Hub components (Direcția B)
export { AuthLayout } from './AuthLayout/AuthLayout';
export type { AuthLayoutProps } from './AuthLayout/AuthLayout';

export { BrandZone } from './BrandZone/BrandZone';
export type { BrandZoneProps } from './BrandZone/BrandZone';
export { Logo } from './Logo/Logo';
export type { LogoProps } from './Logo/Logo';

export { AppDock } from './AppDock/AppDock';
export type { AppDockProps, DockApp, DockLaunch } from './AppDock/AppDock';

export { PortalPresence } from './PortalPresence/PortalPresence';
export type {
  PortalPresenceProps,
  PortalPresenceLabels,
  PortalStatus,
} from './PortalPresence/PortalPresence';

export { AppLaunch } from './AppLaunch/AppLaunch';
export type { AppLaunchProps } from './AppLaunch/AppLaunch';

// Lot 4 — Feedback & Status
export { Toast } from './Toast/Toast';
export type { ToastProps, ToastTone, ToastAction } from './Toast/Toast';

export { StatusPill } from './StatusPill/StatusPill';
export type { StatusPillProps, StatusPillTone } from './StatusPill/StatusPill';

export { StatusDot } from './StatusDot/StatusDot';
export type { StatusDotProps, StatusDotTone } from './StatusDot/StatusDot';

export { Badge } from './Badge/Badge';
export type { BadgeProps, BadgeTone } from './Badge/Badge';

export { Avatar, AvatarGroup } from './Avatar/Avatar';
export type {
  AvatarProps,
  AvatarGroupProps,
  AvatarGroupPerson,
  AvatarSize,
  AvatarStatus,
} from './Avatar/Avatar';

export { Notice } from './Notice/Notice';
export type { NoticeProps, NoticeTone } from './Notice/Notice';

export { AttentionList } from './AttentionList/AttentionList';
export type {
  AttentionListProps,
  AttentionItem,
  AttentionAction,
} from './AttentionList/AttentionList';

export { EmptyState } from './EmptyState/EmptyState';
export type { EmptyStateProps } from './EmptyState/EmptyState';

export { Skeleton, SkeletonText } from './Skeleton/Skeleton';
export type { SkeletonProps, SkeletonTextProps } from './Skeleton/Skeleton';

export { ProgressBar } from './ProgressBar/ProgressBar';
export type { ProgressBarProps } from './ProgressBar/ProgressBar';

export { UsageMeter } from './UsageMeter/UsageMeter';
export type { UsageMeterProps } from './UsageMeter/UsageMeter';

export { Kbd } from './Kbd/Kbd';
export type { KbdProps } from './Kbd/Kbd';

// Lot 5 — Data & visualization
export { DataTable } from './DataTable/DataTable';
export type {
  DataTableProps,
  DataTableColumn,
  DataTableRow,
  DataTableSort,
  DataTablePagination,
  DataTableAction,
  DataTableLabels,
  DataTableKey,
} from './DataTable/DataTable';

export { Stat, StatGroup } from './Stat/Stat';
export type { StatProps, StatTone, StatDelta } from './Stat/Stat';

export { BarChart } from './BarChart/BarChart';
export type { BarChartProps, BarChartDataItem } from './BarChart/BarChart';
export type { ChartLabels } from './Chart/ChartFrame';
export type { ChartColor } from './Chart/chart';

export { LineChart } from './LineChart/LineChart';
export type { LineChartProps, LineSeries } from './LineChart/LineChart';

export { Timeline } from './Timeline/Timeline';
export type {
  TimelineProps,
  TimelinePeriod,
  TimelineRow,
  TimelineStatus,
} from './Timeline/Timeline';

// Lot 6 — Scheduling & Rules
export { DatePicker, Calendar, intlLocale } from './DatePicker/DatePicker';
export type {
  DatePickerProps,
  DatePickerMode,
  DatePickerLabels,
  DatePickerValue,
  DateRange,
  CalendarProps,
} from './DatePicker/DatePicker';

export { SlotPicker } from './SlotPicker/SlotPicker';
export type { SlotPickerProps, SlotItem } from './SlotPicker/SlotPicker';

export { RuleBuilder } from './RuleBuilder/RuleBuilder';
export type {
  RuleBuilderProps,
  RuleBuilderLabels,
  RuleCriterion,
  RuleRow,
} from './RuleBuilder/RuleBuilder';

export { Kanban, KanbanCard } from './Kanban/Kanban';
export type {
  KanbanProps,
  KanbanCardProps,
  KanbanColumn,
  KanbanCardData,
  KanbanLabels,
  KanbanCardDue,
  KanbanContext,
} from './Kanban/Kanban';

export { Schedule } from './Schedule/Schedule';
export type {
  ScheduleProps,
  ScheduleColumn,
  ScheduleEvent,
  ScheduleEventStatus,
  ScheduleStatusLabels,
} from './Schedule/Schedule';

// Lot 7 — Agenda
export { Agenda } from './Agenda/Agenda';
export type { AgendaProps, AgendaItem, AgendaItemStatus } from './Agenda/Agenda';

// Utilities
export { cn } from './lib/cn';
export type { ForcedState } from './lib/forced';

// Lotul 7 — meniuri și shell
export { ThemeSwitcher } from './ThemeSwitcher/ThemeSwitcher';
export type {
  ThemeSwitcherProps,
  ThemeSwitcherLabels,
  ThemeChoice,
} from './ThemeSwitcher/ThemeSwitcher';
export { LanguageSwitcher, LOCALES } from './LanguageSwitcher/LanguageSwitcher';
export type { LanguageSwitcherProps, LocaleCode } from './LanguageSwitcher/LanguageSwitcher';
export { OrgSwitcher } from './OrgSwitcher/OrgSwitcher';
export type { OrgSwitcherProps, OrgSwitcherLabels, Org } from './OrgSwitcher/OrgSwitcher';
export { AccountMenu } from './AccountMenu/AccountMenu';
export type { AccountMenuProps, AccountMenuLabels } from './AccountMenu/AccountMenu';
export { RecommendationLabel } from './RecommendationLabel/RecommendationLabel';
export type { RecommendationLabelProps } from './RecommendationLabel/RecommendationLabel';
export { AccessBadge } from './AccessBadge/AccessBadge';
export type { AccessBadgeProps, AccessLabels, AccessState } from './AccessBadge/AccessBadge';
export { AppTile } from './AppTile/AppTile';
export type { AppTileProps, AppTileLabels, AppTileRecommendation } from './AppTile/AppTile';
export { RecommendationCard } from './RecommendationCard/RecommendationCard';
export type {
  RecommendationCardProps,
  RecommendationCardLabels,
} from './RecommendationCard/RecommendationCard';
export { RemindMenu } from './RecommendationCard/RemindMenu';
export type { RemindLabels } from './RecommendationCard/RemindMenu';
export { DiscoveryTooltip } from './DiscoveryTooltip/DiscoveryTooltip';
export type {
  DiscoveryTooltipProps,
  DiscoveryTooltipLabels,
} from './DiscoveryTooltip/DiscoveryTooltip';
export { GrowthSlot } from './GrowthSlot/GrowthSlot';
export type { GrowthSlotProps } from './GrowthSlot/GrowthSlot';
export { NotificationsPanel, HubRecommendation } from './NotificationsPanel/NotificationsPanel';
export type {
  NotificationsPanelProps,
  NotificationsLabels,
  NotificationData,
  HubRecommendationData,
} from './NotificationsPanel/NotificationsPanel';
export { AddonPurchase } from './AddonPurchase/AddonPurchase';
export type {
  AddonPurchaseProps,
  AddonPurchaseLabels,
  AddonData,
} from './AddonPurchase/AddonPurchase';
export {
  PaymentCard,
  StripeSlot,
  PayProcessing,
  PaySuccess,
  PayError,
  PayErrorActions,
} from './AddonPurchase/Payment';
export type { PaymentCardData, PaymentLabels, PayUsage, PayInvoice } from './AddonPurchase/Payment';
export { UpgradeDialog } from './UpgradeDialog/UpgradeDialog';
export type {
  UpgradeDialogProps,
  UpgradeLabels,
  UpgradeOption,
  UpgradeSummary,
} from './UpgradeDialog/UpgradeDialog';
