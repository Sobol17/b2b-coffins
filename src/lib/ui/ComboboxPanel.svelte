<script lang="ts">
	import { onMount } from 'svelte';
	import { Check } from '@lucide/svelte';
	import * as Command from '$lib/ui/base/command/index.js';
	import type { SelectOption } from './options';

	/*
	 * Loaded on first open by Combobox. The command palette is the heaviest control in the kit, and
	 * a registry filter that is never opened must not ship it.
	 */
	let {
		options,
		searchable,
		value,
		onChoose
	}: {
		options: readonly SelectOption[];
		searchable: boolean;
		value: string;
		onChoose: (value: string) => void;
	} = $props();
	let searchInput = $state<HTMLInputElement | null>(null);
	onMount(() => searchInput?.focus({ preventScroll: true }));
</script>

<Command.Root class="min-h-0 [&_[data-slot=command-input-wrapper]]:shrink-0">
	{#if searchable}
		<Command.Input
			bind:ref={searchInput}
			placeholder="Поиск по списку"
			aria-label="Поиск по списку"
		/>
	{/if}
	<Command.List class="max-h-64 min-h-0 overscroll-contain p-1">
		<Command.Empty>Ничего не найдено</Command.Empty>
		{#each options as option (option.value)}
			<Command.Item
				class="min-h-10 cursor-pointer items-start gap-3 rounded-md px-3 py-2.5"
				value={option.label}
				onSelect={() => onChoose(option.value)}
			>
				<span class="min-w-0 flex-1 break-words whitespace-normal">{option.label}</span>
				<Check
					aria-hidden="true"
					class={value === option.value
						? 'mt-0.5 size-4 shrink-0 text-link'
						: 'mt-0.5 size-4 shrink-0 opacity-0'}
				/>
			</Command.Item>
		{/each}
	</Command.List>
</Command.Root>
