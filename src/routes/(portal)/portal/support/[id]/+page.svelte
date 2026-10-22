<script lang="ts">
	import { resolve } from '$app/paths';
	import { profileNavItems } from '$lib/portal/profile-nav';
	import ProfileNav from '$lib/portal/ProfileNav.svelte';
	import SupportThreadView from '$lib/support/SupportThreadView.svelte';
	import { Breadcrumbs } from '$lib/ui';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const thread = $derived(data.thread);
	const failure = $derived(form && 'formError' in form ? form.formError : undefined);
</script>

<svelte:head><title>Обращение №{thread.id}</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Чат', href: resolve('/portal/support') },
				{ label: `Обращение №${thread.id}` }
			]}
		/>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[17.5rem_1fr] lg:items-start">
		<ProfileNav
			title={data.counterparty.name}
			items={profileNavItems('support', {
				staff: data.canManageStaff,
				prices: data.canManagePrices
			})}
		/>

		<section class="flex flex-col gap-6">
			<h1 data-testid="support-subject" class="px-2 text-4xl">{thread.subject}</h1>
			<SupportThreadView
				{thread}
				contour="portal"
				timeZone={data.timezone}
				formError={failure}
				requestHref={thread.requestId === null
					? null
					: resolve(`/portal/requests/${thread.requestId}`)}
				newThreadHref={resolve('/portal/support/new')}
			/>
		</section>
	</div>
</div>
