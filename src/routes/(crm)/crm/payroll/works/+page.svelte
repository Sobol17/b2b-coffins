<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { PAYROLL_TABS } from '$lib/crm/sections';
	import DirectoryTable from '$lib/crm/payroll/DirectoryTable.svelte';
	import WorkRateMatrix from '$lib/crm/payroll/WorkRateMatrix.svelte';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { withListQuery } from '$lib/utils/list-url';
	import type { ListQuery } from '$lib/types/list';
	import WorkTypeModal from '$lib/crm/payroll/WorkTypeModal.svelte';
	import { roubles, workRoleTitle } from '$lib/crm/payroll/labels';
	import { Button, Card, Input, Select, Tabs } from '$lib/ui';
	import type { WorkTypeDto } from '$lib/types/crm-payroll';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// null: closed; 'new': a new work; a work: the edit of that one.
	let activeTab = $derived(page.url.searchParams.get('tab') === 'manual' ? 'manual' : 'positions');
	let editing = $state<WorkTypeDto | 'new' | null>(null);
	let search = $derived(page.url.searchParams.get('search') ?? '');
	const matrix = $derived(data.matrix);
	const query = $derived({ page: matrix.page, perPage: matrix.perPage });
	function changeQuery(next: ListQuery): void {
		void goto(resolve(`/crm/payroll/works?${withListQuery(page.url, next).searchParams}`), {
			keepFocus: true,
			noScroll: true
		});
	}

	function edit(work: WorkTypeDto): void {
		form = null;
		editing = work;
	}
</script>

<svelte:head><title>Работы и стоимость</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<SectionTabs tabs={PAYROLL_TABS} label="Выплаты" />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Работы и стоимость</h1>
			<p class="max-w-2xl text-fg-muted">
				Расценка позиции применяется к изделиям выбранной роли. Без привязки работу можно добавить
				вручную в рабочий день.
			</p>
		</div>
		{#if data.canManage}
			<Button
				class="sm:ml-auto"
				onclick={() => {
					form = null;
					editing = 'new';
				}}>Добавить работу</Button
			>
		{/if}
	</div>

	<form method="GET" class="flex flex-wrap items-end gap-3">
		<div class="min-w-56 flex-1">
			<Input
				name="search"
				label="Поиск по работам и позициям"
				type="search"
				placeholder="Артикул или название"
				bind:value={search}
			/>
		</div>
		<input type="hidden" name="tab" value={activeTab} />
		<input type="hidden" name="perPage" value={query.perPage} />
		<Button type="submit" variant="secondary">Найти</Button>
	</form>
	<div class="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Единые расценки">
		{#each [['Руководитель Олег', '350 ₽ за готовое изделие'], ['Руководитель Виталий', '350 ₽ за готовое изделие'], ['Администратор', '300 ₽ за готовое изделие'], ['Водитель', '200 ₽ за доставленное изделие']] as rate (rate[0])}
			<div class="rounded-inset bg-surface-muted p-3">
				<div class="font-medium">{rate[0]}</div>
				<div class="text-fg-muted">{rate[1]}</div>
			</div>
		{/each}
	</div>

	<Card.Root>
		<Card.Content>
			<Tabs.Root
				value={activeTab}
				onValueChange={(value) => {
					const url = new URL(page.url);
					url.searchParams.set('tab', value);
					replaceState(resolve(`/crm/payroll/works?${url.searchParams}`), page.state);
				}}
			>
				<Tabs.List
					aria-label="Виды расценок"
					variant="line"
					class="mb-4 max-w-full overflow-x-auto"
				>
					<Tabs.Trigger value="positions">Расценки позиций</Tabs.Trigger>
					<Tabs.Trigger value="manual">Дополнительные работы</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="positions">
					<p class="mb-4 text-sm text-fg-muted">
						Нажмите на сумму, чтобы изменить расценку. Цена едина для всех размеров модели и
						материала. «Не задана» — расценки нет, «Выключена» — не применяется. Нулевая расценка
						показывается как 0 ₽.
					</p>
					<div class="mb-3 flex flex-wrap items-end justify-between gap-3">
						<span class="text-sm text-fg-muted">Найдено позиций: {matrix.total}</span>
						<Select
							label="Строк на странице"
							placeholder="Размер страницы"
							bind:value={
								() => String(query.perPage),
								(value: string) => changeQuery({ page: 1, perPage: Number(value) })
							}
							options={[7, 20, 50].map((n) => ({ value: String(n), label: String(n) }))}
						/>
					</div>
					<WorkRateMatrix
						positions={matrix.positions}
						total={matrix.total}
						{query}
						onQueryChange={changeQuery}
						canManage={data.canManage}
						onEdit={edit}
					/>
				</Tabs.Content>
				<Tabs.Content value="manual">
					<p class="mb-4 text-sm text-fg-muted">
						Без привязки к позиции, для ручного ввода в рабочий день.
					</p>
					<DirectoryTable
						rows={matrix.manual}
						canManage={data.canManage}
						statusTitle={{ on: 'Используется', off: 'Выключена' }}
						emptyTitle={search.trim()
							? 'Дополнительные работы не найдены'
							: 'Дополнительных работ нет'}
						nameOf={(row) => row.title}
						onEdit={edit}
					>
						{#snippet own(row: WorkTypeDto)}
							<span data-testid="work-role">{workRoleTitle(row)}</span> ·
							<span class="tabular-nums" data-testid="work-rate">{roubles(row.rateMinor)}</span> за единицу
						{/snippet}
					</DirectoryTable>
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>
</div>

<WorkTypeModal
	open={editing !== null}
	work={editing === 'new' ? null : editing}
	variants={data.variants}
	formError={form && 'formError' in form && (form.action === 'create' || form.action === 'update')
		? form.formError
		: undefined}
	onClose={() => (editing = null)}
/>
