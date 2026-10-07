<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { REPORT_TABS } from '$lib/crm/sections';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<SectionTabs tabs={REPORT_TABS} label="Отчёты" testId="reports-nav" />
	{@render children()}
</div>
