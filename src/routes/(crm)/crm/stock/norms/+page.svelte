<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import NormModal from '$lib/crm/bom/NormModal.svelte';
	import NormsTable from '$lib/crm/bom/NormsTable.svelte';
	import VersionsCard from '$lib/crm/bom/VersionsCard.svelte';
	import { IMPORT_STATUS_TEXT } from '$lib/crm/bom/labels';
	import {
		Breadcrumbs,
		Button,
		Card,
		EmptyState,
		FilterBar,
		TONE_CLASS,
		buttonVariants,
		withToast,
		type FilterField
	} from '$lib/ui';
	import type { ListQuery } from '$lib/types/list';
	import { filtersOf, listQueryOf, withListQuery } from '$lib/utils/list-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const bom = $derived(data.bom);
	const fields: FilterField[] = [
		{ key: 'search', label: 'Поиск', type: 'text', placeholder: 'Введите артикул или код' }
	];
	let filters = $state(filtersOf(page.url, ['search']));
	let normOpen = $state(false);
	const IMPORT_TONE = { queued: 'info', done: 'success', failed: 'danger' } as const;

	function changeQuery(next: ListQuery): void {
		// Same page with a rewritten query string, so there is no route pattern to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(withListQuery(page.url, next), { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Нормы комплектующих</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<Breadcrumbs items={[{ label: 'Склад', href: resolve('/crm/stock') }, { label: 'Нормы' }]} />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Нормы комплектующих</h1>
			<p class="max-w-2xl text-fg-muted">
				Отметка выпуска в цехе списывает комплектующие по нормам активной версии.
			</p>
		</div>
		{#if bom.canManage}
			<div class="flex flex-wrap gap-2 sm:ml-auto">
				<a
					class={buttonVariants({ variant: 'secondary' })}
					href={resolve('/crm/stock/norms/import')}
				>
					Импорт из файла
				</a>
				<form
					method="POST"
					action="?/createVersion"
					use:enhance={withToast({ success: 'Новая версия активна' })}
				>
					<Button type="submit" variant="secondary">Новая версия</Button>
				</form>
			</div>
		{/if}
	</div>

	{#if data.importState}
		<p
			class={['rounded-inset px-4 py-3 text-sm', TONE_CLASS[IMPORT_TONE[data.importState.status]]]}
			data-testid="bom-import-state"
		>
			{IMPORT_STATUS_TEXT[data.importState.status]}{data.importState.version === null
				? ''
				: `: версия ${data.importState.version}`}
		</p>
	{/if}

	{#if bom.shown && data.norms}
		<VersionsCard
			versions={bom.versions}
			shownId={bom.shown.id}
			canManage={bom.canManage}
			timeZone={data.timezone}
		/>
		<Card.Root>
			<Card.Header>
				<Card.Title>Версия {bom.shown.version}</Card.Title>
				<Card.Description>
					{bom.shown.isActive
						? 'Активная версия. Правка нормы действует со следующей отметки выпуска.'
						: 'Прежняя версия, только чтение.'}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="flex flex-wrap items-end gap-3">
					<div class="grow"><FilterBar {fields} bind:filters /></div>
					{#if bom.canEdit}
						<Button onclick={() => (normOpen = true)}>Добавить норму</Button>
					{/if}
				</div>
				<NormsTable
					rows={data.norms.rows}
					total={data.norms.total}
					query={listQueryOf(page.url, data.norms)}
					onQueryChange={changeQuery}
					canEdit={bom.canEdit}
				/>
			</Card.Content>
		</Card.Root>
	{:else}
		<EmptyState
			title="Версий норм пока нет"
			description="Импортируйте файл норм или создайте пустую версию и добавьте нормы вручную."
		/>
	{/if}
</div>

{#if data.choices}
	<NormModal bind:open={normOpen} choices={data.choices} />
{/if}
