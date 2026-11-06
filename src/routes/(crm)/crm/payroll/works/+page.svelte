<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { PAYROLL_TABS } from '$lib/crm/sections';
	import DirectoryTable from '$lib/crm/payroll/DirectoryTable.svelte';
	import WorkRateMatrix from '$lib/crm/payroll/WorkRateMatrix.svelte';
	import { buildWorkMatrix } from '$lib/crm/payroll/work-matrix';
	import WorkTypeModal from '$lib/crm/payroll/WorkTypeModal.svelte';
	import { roubles, workRoleTitle } from '$lib/crm/payroll/labels';
	import { Button, Card, Input } from '$lib/ui';
	import type { WorkTypeDto } from '$lib/types/crm-payroll';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// null: closed; 'new': a new work; a work: the edit of that one.
	let editing = $state<WorkTypeDto | 'new' | null>(null);
	let search = $state('');
	const matrix = $derived(buildWorkMatrix(data.works, data.variants, search));

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

	<Input
		label="Поиск по работам и позициям"
		type="search"
		placeholder="Введите артикул, название или размер"
		bind:value={search}
	/>

	<Card.Root>
		<Card.Content>
			<h2 class="mb-2 text-2xl">Расценки позиций</h2>
			<p class="mb-4 text-sm text-fg-muted">
				Цена за единицу по каждой роли. «Не задана» — расценки нет, «Выключена» — не применяется.
				Нулевая расценка показывается как 0 ₽.
			</p>
			<WorkRateMatrix positions={matrix.positions} canManage={data.canManage} onEdit={edit} />
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content>
			<h2 class="mb-2 text-2xl">Дополнительные работы</h2>
			<p class="mb-4 text-sm text-fg-muted">
				Без привязки к позиции, для ручного ввода в рабочий день.
			</p>
			<DirectoryTable
				rows={matrix.manual}
				canManage={data.canManage}
				statusTitle={{ on: 'Используется', off: 'Выключена' }}
				emptyTitle={search.trim() ? 'Дополнительные работы не найдены' : 'Дополнительных работ нет'}
				nameOf={(row) => row.title}
				onEdit={edit}
			>
				{#snippet own(row: WorkTypeDto)}
					<span data-testid="work-role">{workRoleTitle(row)}</span> ·
					<span class="tabular-nums" data-testid="work-rate">{roubles(row.rateMinor)}</span> за единицу
				{/snippet}
			</DirectoryTable>
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
