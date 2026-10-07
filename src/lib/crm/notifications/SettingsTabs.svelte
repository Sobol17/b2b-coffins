<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { NOTIFICATION_TABS } from '$lib/crm/sections';
</script>

<SectionTabs tabs={NOTIFICATION_TABS} label="Разделы уведомлений" testId="notification-tabs" />
