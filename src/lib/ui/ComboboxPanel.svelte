<script lang="ts">
	import * as Command from '$lib/ui/base/command/index.js';
	import type { SelectOption } from './options';

	/*
	 * Loaded on first open by Combobox. The command palette is the heaviest control in the kit, and
	 * a registry filter that is never opened must not ship it.
	 */
	let {
		options,
		searchable,
		onChoose
	}: {
		options: readonly SelectOption[];
		searchable: boolean;
		onChoose: (value: string) => void;
	} = $props();
</script>

<Command.Root>
	{#if searchable}
		<Command.Input placeholder="Начните вводить название" />
	{/if}
	<Command.List>
		<Command.Empty>Ничего не найдено</Command.Empty>
		{#each options as option (option.value)}
			<Command.Item value={option.label} onSelect={() => onChoose(option.value)}>
				{option.label}
			</Command.Item>
		{/each}
	</Command.List>
</Command.Root>
