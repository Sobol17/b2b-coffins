<script lang="ts" module>
	import type { SelectOption } from './options';

	export interface FilterField {
		readonly key: string;
		readonly label: string;
		readonly type: 'text' | 'select' | 'date';
		readonly options?: readonly SelectOption[];
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/ui/base/button/button.svelte';
	import DatePicker from './DatePicker.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';

	/*
	 * Filters live in the URL so a registry view can be shared and reloaded. The state is pushed with
	 * replaceState: filtering is not a navigation step a user wants in their back button.
	 */
	let {
		fields,
		filters = $bindable({}),
		syncToUrl = true
	}: {
		fields: readonly FilterField[];
		filters?: Record<string, string>;
		syncToUrl?: boolean;
	} = $props();

	function apply(): void {
		if (!syncToUrl) return;
		const url = new URL(page.url);
		for (const field of fields) {
			const value = filters[field.key] ?? '';
			if (value === '') url.searchParams.delete(field.key);
			else url.searchParams.set(field.key, value);
		}
		// A filter change resets paging: page 3 of the old result set means nothing for the new one.
		url.searchParams.delete('page');
		// The target is this page's url with a rewritten query, so there is no route to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function set(key: string, value: string): void {
		filters = { ...filters, [key]: value };
		apply();
	}

	function reset(): void {
		filters = {};
		apply();
	}
</script>

<div data-slot="filter-bar" class="flex flex-wrap items-end gap-3">
	{#each fields as field (field.key)}
		<div class="min-w-48">
			{#if field.type === 'select'}
				<Select
					label={field.label}
					options={field.options ?? []}
					bind:value={() => filters[field.key] ?? '', (next) => set(field.key, next)}
				/>
			{:else if field.type === 'date'}
				<DatePicker
					label={field.label}
					bind:value={() => filters[field.key] ?? '', (next) => set(field.key, next)}
				/>
			{:else}
				<Input
					label={field.label}
					bind:value={() => filters[field.key] ?? '', (next) => set(field.key, next)}
				/>
			{/if}
		</div>
	{/each}

	<Button variant="secondary" onclick={reset}>Сбросить</Button>
</div>
