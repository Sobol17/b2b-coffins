<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import * as Popover from '$lib/ui/base/popover/index.js';
	import Button from '$lib/ui/base/button/button.svelte';
	import Field from './Field.svelte';
	import PanelFallback from './PanelFallback.svelte';
	import { LazyComponent } from './lazy.svelte';
	import type { SelectOption } from './options';

	let {
		options,
		label,
		hint,
		error,
		required = false,
		value = $bindable(''),
		id,
		name,
		searchable = true,
		placeholder,
		disabled = false
	}: {
		options: readonly SelectOption[];
		label?: string | undefined;
		hint?: string | undefined;
		error?: string | undefined;
		required?: boolean;
		value?: string;
		id?: string | undefined;
		name?: string | undefined;
		searchable?: boolean;
		/** Required: a generic «choose a value» tells nothing about the field. */
		placeholder: string;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
	const selected = $derived(options.find((option) => option.value === value));

	let open = $state(false);

	const panel = new LazyComponent(() => import('./ComboboxPanel.svelte'));

	$effect(() => {
		if (open) panel.request();
	});

	function choose(next: string): void {
		value = next;
		open = false;
	}
</script>

<Field id={fieldId} {label} {hint} {error} {required}>
	{#snippet control()}
		<Popover.Root bind:open>
			<Popover.Trigger id={fieldId} {disabled}>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						class={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground')}
						role="combobox"
						aria-expanded={open}
						aria-required={required}
						aria-invalid={error ? 'true' : undefined}
						aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
					>
						<span class="min-w-0 truncate text-left">{selected?.label ?? placeholder}</span>
						<ChevronDown
							aria-hidden="true"
							class={cn(
								'ml-2 size-4 shrink-0 text-fg-faint transition-transform duration-150 motion-reduce:transition-none',
								open && 'rotate-180'
							)}
						/>
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content
				class="max-h-(--bits-popover-content-available-height) w-(--bits-popover-anchor-width) max-w-[calc(100vw-2rem)] overflow-hidden p-0 motion-reduce:animate-none"
			>
				{#if panel.component}
					{@const Panel = panel.component}
					<Panel {options} {searchable} {value} onChoose={choose} />
				{:else}
					<PanelFallback failed={panel.failed} />
				{/if}
			</Popover.Content>
		</Popover.Root>
		<input type="hidden" {name} {value} />
	{/snippet}
</Field>
