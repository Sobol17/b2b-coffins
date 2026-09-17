<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import * as Command from '$lib/ui/base/command/index.js';
	import type { SiteSearchDto } from '$lib/types/search';
	import type { ProfileNavRights } from '../profile-nav';
	import { matchSections, portalSections } from './portal-sections';

	let { open = $bindable(false), rights }: { open?: boolean; rights: ProfileNavRights } = $props();

	const DEBOUNCE_MS = 250;
	const MIN_QUERY = 2;

	let query = $state('');
	let found = $state<SiteSearchDto | null>(null);
	let loading = $state(false);

	const sections = $derived(matchSections(portalSections(rights), query));
	const empty = $derived(
		!loading &&
			sections.length === 0 &&
			(found === null || found.categories.length + found.products.length === 0)
	);

	$effect(() => {
		if (!open) query = '';
	});

	// Each keystroke cancels the request of the previous one: a slow answer must not overwrite a newer.
	$effect(() => {
		const q = query.trim();
		found = null;
		if (q.length < MIN_QUERY) {
			loading = false;
			return;
		}
		loading = true;
		const controller = new AbortController();
		const timer = setTimeout(() => {
			void load(q, controller.signal);
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function load(q: string, signal: AbortSignal): Promise<void> {
		try {
			const response = await fetch(`${resolve('/portal/search')}?${new URLSearchParams({ q })}`, {
				signal
			});
			found = response.ok ? ((await response.json()) as SiteSearchDto) : null;
		} catch {
			if (signal.aborted) return;
			found = null;
		}
		loading = false;
	}

	function go(href: ResolvedPathname): void {
		open = false;
		void goto(href);
	}
</script>

<Command.Dialog
	bind:open
	shouldFilter={false}
	title="Поиск по порталу"
	description="Разделы, группы каталога и товары"
	class="sm:max-w-lg"
>
	<Command.Input bind:value={query} placeholder="Введите запрос" />
	<Command.List data-testid="search-results" class="max-h-[min(24rem,60vh)]">
		{#if sections.length > 0}
			<Command.Group heading="Разделы">
				{#each sections as section (section.href)}
					<Command.Item value="section {section.href}" onSelect={() => go(section.href)}>
						{section.label}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if found && found.categories.length > 0}
			<Command.Group heading="Группы каталога">
				{#each found.categories as category (category.id)}
					<Command.Item
						value="category {category.id}"
						onSelect={() => go(resolve(`/portal/catalog/${category.id}`))}
					>
						{category.title}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if found && found.products.length > 0}
			<Command.Group heading="Товары">
				{#each found.products as product (product.id)}
					<Command.Item
						value="product {product.id}"
						onSelect={() => go(resolve(`/portal/catalog/product/${product.id}`))}
					>
						<span class="truncate">{product.title}</span>
						<Command.Shortcut class="font-sans tracking-normal">{product.sku}</Command.Shortcut>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if loading}
			<Command.Loading class="px-3 py-4 text-sm text-fg-muted">Ищем товары…</Command.Loading>
		{/if}
		{#if empty}
			<p class="px-3 py-6 text-center text-sm text-fg-muted">Ничего не найдено</p>
		{/if}
	</Command.List>
</Command.Dialog>
