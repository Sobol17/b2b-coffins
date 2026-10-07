<script lang="ts">
	import { crmNav } from '$lib/crm/nav';
	import { groupLinks } from '$lib/ui/shell/groups';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const sections = $derived(groupLinks(crmNav(data.can)));
	const firstName = $derived(data.user.fullName.split(' ')[0] ?? '');
</script>

<svelte:head><title>Мастерская</title></svelte:head>

<div class="grid gap-8">
	<header>
		<h1 data-testid="crm-home" class="text-2xl font-semibold">Рабочее место мастерской</h1>
		<p class="mt-1 text-fg-muted">
			{firstName ? `${firstName}, выберите` : 'Выберите'} раздел, с которым работаете.
		</p>
	</header>

	{#each sections as section (section.name)}
		<section aria-labelledby="home-{section.name}">
			<h2 id="home-{section.name}" class="mb-3 text-sm font-medium text-fg-muted">
				{section.name}
			</h2>
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
				{#each section.items as link (link.href)}
					<li>
						<a
							href={link.href}
							data-testid="home-tile"
							class="flex h-full items-start gap-3 rounded-card bg-surface-raised p-4 transition-colors outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px"
						>
							{#if link.icon}
								<span
									class="flex size-10 shrink-0 items-center justify-center rounded-inset bg-brand-100 text-brand-600"
								>
									<link.icon class="size-5" aria-hidden="true" />
								</span>
							{/if}
							<span class="min-w-0">
								<span class="block font-medium">{link.label}</span>
								<span class="block text-sm text-fg-muted">{link.hint}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
