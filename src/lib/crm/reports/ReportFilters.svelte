<script lang="ts">
	import { page } from '$app/state';
	import { presetRange } from '$lib/domain/report/period';
	import { REPORT_PRESETS, type ReportPreset } from '$lib/types/crm-reports';
	import { buttonVariants, FilterBar, type FilterField } from '$lib/ui';

	/* The period, its presets and the sheet link: one bar for every report of the section. */
	let {
		filters,
		today,
		extra = [],
		exportHref
	}: {
		/** What the server read from the address: a preset link changes it under the pickers. */
		filters: Record<string, string>;
		today: string;
		extra?: readonly FilterField[];
		exportHref?: string;
	} = $props();

	const PRESET_TITLE: Readonly<Record<ReportPreset, string>> = {
		week: 'Неделя',
		month: 'Месяц',
		quarter: 'Квартал',
		year: 'Год'
	};
	const fields = $derived<FilterField[]>([
		{ key: 'from', label: 'С', type: 'date', placeholder: 'Выберите дату' },
		{ key: 'to', label: 'По', type: 'date', placeholder: 'Выберите дату' },
		...extra
	]);
	let current = $derived<Record<string, string>>({ ...filters });
	// The sheet takes the query string of the page: the file is what the owner is looking at.
	const exportUrl = $derived(
		exportHref === undefined ? undefined : `${exportHref}${page.url.search}`
	);
	const presetHref = (preset: ReportPreset): string => {
		const url = new URL(page.url);
		const range = presetRange(preset, today);
		url.searchParams.set('from', range.from);
		url.searchParams.set('to', range.to);
		url.searchParams.delete('page');
		return url.search;
	};
</script>

<div class="flex flex-col gap-3">
	<FilterBar {fields} bind:filters={current} />
	<div class="flex flex-wrap items-center gap-2">
		<!-- Same page with a rewritten query string, so there is no route pattern to resolve. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		{#each REPORT_PRESETS as preset (preset)}
			<a
				href={presetHref(preset)}
				class={buttonVariants({ variant: 'ghost', size: 'sm' })}
				data-testid={`preset-${preset}`}
			>
				{PRESET_TITLE[preset]}
			</a>
		{/each}
		{#if exportUrl}
			<!-- A file, not a page: without these the client router would try to render the url. -->
			<a
				href={exportUrl}
				download
				data-sveltekit-reload
				class="{buttonVariants({ variant: 'secondary', size: 'sm' })} ms-auto"
				data-testid="report-export"
			>
				Выгрузить в XLSX
			</a>
		{/if}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
</div>
