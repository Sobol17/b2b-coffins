<script lang="ts">
	import SettingsTabs from '$lib/crm/notifications/SettingsTabs.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="mx-auto mb-6 w-full max-w-6xl">
	<SettingsTabs />
</div>
{@render children()}
