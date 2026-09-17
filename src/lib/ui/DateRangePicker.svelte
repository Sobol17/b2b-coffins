<script lang="ts" module>
	/**
	 * A range needs two ISO strings, so the binding is a pair. Everything crossing the component
	 * boundary is still an ISO date string, as tech.md 9 requires of the date pickers.
	 */
	export interface DateRangeValue {
		start: string;
		end: string;
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import * as Popover from '$lib/ui/base/popover/index.js';
	import Button from '$lib/ui/base/button/button.svelte';
	import Field from './Field.svelte';
	import PanelFallback from './PanelFallback.svelte';
	import { LazyComponent } from './lazy.svelte';
	import { formatDate } from '$lib/utils/format';

	let {
		label,
		hint,
		error,
		required = false,
		value = $bindable({ start: '', end: '' }),
		id,
		name,
		placeholder = 'Выберите период',
		disabled = false
	}: {
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		value?: DateRangeValue;
		id?: string | undefined;
		name?: string | undefined;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);

	let open = $state(false);

	const panel = new LazyComponent(() => import('./DateRangePickerPanel.svelte'));

	$effect(() => {
		if (open) panel.request();
	});

	const isEmpty = $derived(value.start === '' && value.end === '');
	const shown = $derived(
		isEmpty
			? placeholder
			: `${value.start === '' ? '…' : formatDate(`${value.start}T00:00:00Z`)} — ${
					value.end === '' ? '…' : formatDate(`${value.end}T00:00:00Z`)
				}`
	);
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<Popover.Root bind:open>
			<Popover.Trigger id={fieldId} {disabled}>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						class={cn('w-full justify-start font-normal', isEmpty && 'text-muted-foreground')}
						aria-invalid={error ? 'true' : undefined}
					>
						{shown}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-auto p-0">
				{#if panel.component}
					{@const Panel = panel.component}
					<Panel
						{value}
						onPick={(next) => {
							value = next;
							if (next.start !== '' && next.end !== '') open = false;
						}}
					/>
				{:else}
					<PanelFallback failed={panel.failed} />
				{/if}
			</Popover.Content>
		</Popover.Root>
		<input
			type="hidden"
			name={name === undefined ? undefined : `${name}_start`}
			value={value.start}
		/>
		<input type="hidden" name={name === undefined ? undefined : `${name}_end`} value={value.end} />
	{/snippet}
</Field>
