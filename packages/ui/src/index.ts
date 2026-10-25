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
export type { IconButtonProps } from './IconButton/IconButton';

export { Input } from './Input/Input';
export type { InputProps } from './Input/Input';

export { Textarea } from './Textarea/Textarea';
export type { TextareaProps } from './Textarea/Textarea';

export { Select } from './Select/Select';
export type { SelectProps, SelectOption } from './Select/Select';

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
export type { FileUploadProps } from './FileUpload/FileUpload';

export { Combobox } from './Combobox/Combobox';
export type { ComboboxProps, ComboboxOption } from './Combobox/Combobox';

// Navigation & Overlay (Lot 3)
export { Tabs } from './Tabs/Tabs';
export type { TabsProps, TabItem } from './Tabs/Tabs';

export { Pagination } from './Pagination/Pagination';
export type { PaginationProps } from './Pagination/Pagination';

export { Menu, MenuTrigger } from './Menu/Menu';
export type { MenuProps, MenuItemDef, MenuSectionDef } from './Menu/Menu';

export { Tooltip } from './Tooltip/Tooltip';
export type { TooltipProps } from './Tooltip/Tooltip';

export { Dialog, DialogTrigger, DialogHeader, DialogBody, DialogFooter } from './Dialog/Dialog';
export type { DialogProps, DialogTone } from './Dialog/Dialog';

export { Drawer, DrawerTrigger, DrawerHeader, DrawerBody, DrawerFooter } from './Drawer/Drawer';
export type { DrawerProps } from './Drawer/Drawer';

export { CommandPalette } from './CommandPalette/CommandPalette';
export type { CommandPaletteProps, CommandDef } from './CommandPalette/CommandPalette';

export { Sheet, SheetSection } from './Sheet/Sheet';
export type { SheetProps, SheetSectionProps } from './Sheet/Sheet';

export { PageHeader } from './PageHeader/PageHeader';
export type { PageHeaderProps } from './PageHeader/PageHeader';

export { ContextBar } from './ContextBar/ContextBar';
export type { ContextBarProps } from './ContextBar/ContextBar';

export { Spine } from './Spine/Spine';
export type { SpineProps, NavItem } from './Spine/Spine';

export { AppShell } from './AppShell/AppShell';
export type { AppShellProps } from './AppShell/AppShell';

// App icons (Lot 4 demo — Lot 7 va migra la inline SVG)
export { AppIcon } from './AppIcon/AppIcon';
export type { AppIconProps, AppName } from './AppIcon/AppIcon';

// Utilities
export { cn } from './lib/cn';
