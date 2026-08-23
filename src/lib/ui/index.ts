/**
 * The kit of tech.md 9. A slice imports primitives from here and nowhere else: the shadcn parts in
 * `base/` are an implementation detail, not the contract.
 */
export { default as Button, buttonVariants } from './base/button/button.svelte';
export type { ButtonProps, ButtonSize, ButtonVariant } from './base/button/button.svelte';
export { default as TouchButton } from './TouchButton.svelte';

export { default as Input } from './Input.svelte';
export { default as Textarea } from './Textarea.svelte';
export { default as NumberInput } from './NumberInput.svelte';
export { default as MoneyInput } from './MoneyInput.svelte';
export { default as Select } from './Select.svelte';
export { default as Combobox } from './Combobox.svelte';
export { default as Checkbox } from './Checkbox.svelte';
export { default as Switch } from './Switch.svelte';
export { default as RadioGroup } from './RadioGroup.svelte';
export { default as DatePicker } from './DatePicker.svelte';
export { default as DateRangePicker } from './DateRangePicker.svelte';
export type { DateRangeValue } from './DateRangePicker.svelte';
export { default as FileUpload } from './FileUpload.svelte';
export type { SelectOption } from './options';

export { default as DataTable } from './DataTable.svelte';
export type { DataTableColumn } from './DataTable.svelte';
export { default as FilterBar } from './FilterBar.svelte';
export type { FilterField } from './FilterBar.svelte';
export { default as Pagination } from './Pagination.svelte';
export { default as Breadcrumbs } from './Breadcrumbs.svelte';
export type { Crumb } from './Breadcrumbs.svelte';

export { default as Modal } from './Modal.svelte';
export { default as Drawer } from './Drawer.svelte';
export { default as ConfirmDialog } from './ConfirmDialog.svelte';

export { toast } from './toast.svelte';
export type { Toast, ToastKind } from './toast.svelte';
export { default as Toaster } from './Toaster.svelte';

export { default as StatusBadge } from './StatusBadge.svelte';
export { default as Stepper } from './Stepper.svelte';
export { REQUEST_STATUS_FLOW, REQUEST_STATUS_META, TONE_CLASS } from './status';
export type { StatusMeta, StatusTone } from './status';

export * as Card from './base/card/index.js';
export * as Tabs from './base/tabs/index.js';
export { Skeleton } from './base/skeleton/index.js';
export { Spinner } from './base/spinner/index.js';

export { default as EmptyState } from './EmptyState.svelte';
export { default as ErrorState } from './ErrorState.svelte';

export { default as KanbanBoard } from './KanbanBoard.svelte';
export { default as KanbanColumn } from './KanbanColumn.svelte';
export { default as KanbanCard } from './KanbanCard.svelte';
export type { KanbanItem } from './KanbanCard.svelte';

export { default as AnimatedCounter } from './AnimatedCounter.svelte';
export { default as PhotoGallery } from './PhotoGallery.svelte';
export { default as PhotoUploader } from './PhotoUploader.svelte';
export { default as PriceCell } from './PriceCell.svelte';

export { default as ContourShell } from './ContourShell.svelte';
