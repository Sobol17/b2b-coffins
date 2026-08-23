<script lang="ts">
	import * as Popover from '$lib/ui/base/popover/index.js';
	import Button from '$lib/ui/base/button/button.svelte';
	import Field from './Field.svelte';
	import PanelFallback from './PanelFallback.svelte';
	import { LazyComponent } from './lazy.svelte';
	import { formatDate } from '$lib/utils/format';

	// The binding stays an ISO date string: CalendarDate is an implementation detail of the panel.
	let {
		label,
		hint,
		error,
		required = false,
		value = $bindable(''),
		id,
		name,
		placeholder = 'Выберите дату',
		disabled = false
	}: {
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		value?: string;
		id?: string | undefined;
		name?: string | undefined;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);

	let open = $state(false);

	const panel = new LazyComponent(() => import('./DatePickerPanel.svelte'));

	$effect(() => {
		if (open) panel.request();
	});
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<Popover.Root bind:open>
			<Popover.Trigger id={fieldId} {disabled}>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						class="w-full justify-start font-normal"
						aria-invalid={error ? 'true' : undefined}
					>
						{value === '' ? placeholder : formatDate(`${value}T00:00:00Z`)}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-auto p-0">
				{#if panel.component}
					{@const Panel = panel.component}
					<Panel
						{value}
						onPick={(iso) => {
							value = iso;
							open = false;
						}}
					/>
				{:else}
					<PanelFallback failed={panel.failed} />
				{/if}
			</Popover.Content>
		</Popover.Root>
		<input type="hidden" {name} {value} />
	{/snippet}
</Field>
