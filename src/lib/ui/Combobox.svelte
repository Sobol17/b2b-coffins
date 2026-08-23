<script lang="ts">
	import * as Command from '$lib/ui/base/command/index.js';
	import * as Popover from '$lib/ui/base/popover/index.js';
	import Button from '$lib/ui/base/button/button.svelte';
	import Field from './Field.svelte';
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
		placeholder = 'Выберите значение',
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
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	const generatedId = $props.id();
	const fieldId = $derived(id ?? generatedId);
	const selected = $derived(options.find((option) => option.value === value));

	let open = $state(false);

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
						class="w-full justify-between font-normal"
						aria-invalid={error ? 'true' : undefined}
					>
						{selected?.label ?? placeholder}
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-(--bits-popover-anchor-width) p-0">
				<Command.Root>
					{#if searchable}
						<Command.Input placeholder="Поиск" />
					{/if}
					<Command.List>
						<Command.Empty>Ничего не найдено</Command.Empty>
						{#each options as option (option.value)}
							<Command.Item value={option.label} onSelect={() => choose(option.value)}>
								{option.label}
							</Command.Item>
						{/each}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
		<input type="hidden" {name} {value} />
	{/snippet}
</Field>
