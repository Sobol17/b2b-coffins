<script lang="ts">
	import SectionTabs from '$lib/crm/SectionTabs.svelte';
	import { PAYROLL_TABS } from '$lib/crm/sections';
	import { resolve } from '$app/paths';
	import AdjustModal from '$lib/crm/payroll/AdjustModal.svelte';
	import WeekActionModal from '$lib/crm/payroll/WeekActionModal.svelte';
	import WeekDays from '$lib/crm/payroll/WeekDays.svelte';
	import WeekLinesTable from '$lib/crm/payroll/WeekLinesTable.svelte';
	import {
		PERIOD_STATUS_TITLE,
		PERIOD_STATUS_TONE,
		dayTitle,
		roubles
	} from '$lib/crm/payroll/labels';
	import { addDays } from '$lib/domain/payroll/calc';
	import { Button, Card, TONE_CLASS, buttonVariants } from '$lib/ui';
	import type { PayrollLineDto } from '$lib/types/crm-payroll';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const week = $derived(data.week);
	const weekHref = (date: string) => `${resolve('/crm/payroll')}?week=${date}`;
	const sheetHref = $derived(`${resolve('/crm/payroll/sheet.xlsx')}?week=${week.startsOn}`);

	let adjusting = $state<PayrollLineDto | null>(null);
	let paying = $state<PayrollLineDto | null>(null);
	let confirming = $state<'close' | 'reopen' | null>(null);
</script>

<svelte:head><title>Выплаты</title></svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
	<SectionTabs tabs={PAYROLL_TABS} label="Выплаты" />
	<div class="flex flex-wrap items-end gap-4">
		<div>
			<h1 class="mb-2 text-3xl">Выплаты</h1>
			<p class="max-w-2xl text-fg-muted">
				Отметьте в дне, кто работал и что сделали: сумму дня система делит поровну. В конце недели
				закройте её и отметьте выплаты.
			</p>
		</div>
		<div class="flex flex-wrap gap-2 sm:ml-auto">
			<a
				class={buttonVariants()}
				href={resolve(`/crm/payroll/day/${data.today}`)}
				data-testid="mark-today"
			>
				Отметить сегодня
			</a>
		</div>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-3">
				<h2 class="text-2xl" data-testid="week-title">
					Неделя {dayTitle(week.startsOn)} – {dayTitle(week.endsOn)}
				</h2>
				<span
					class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS[PERIOD_STATUS_TONE[week.status]]]}
					data-testid="week-status"
				>
					{PERIOD_STATUS_TITLE[week.status]}
				</span>
				<!-- The week links carry a query string, so they are built urls, not route patterns. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<div class="flex flex-wrap gap-2 sm:ml-auto">
					<a
						class={buttonVariants({ variant: 'ghost', size: 'sm' })}
						href={weekHref(addDays(week.startsOn, -7))}
					>
						Предыдущая
					</a>
					<a
						class={buttonVariants({ variant: 'ghost', size: 'sm' })}
						href={weekHref(addDays(week.startsOn, 7))}
					>
						Следующая
					</a>
				</div>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
			{#if week.closedAt}
				<p class="text-sm text-fg-muted">
					Закрыл {week.closedByName ?? 'сотрудник'}
					{formatDateTime(week.closedAt, data.timezone)}
				</p>
			{/if}
			<WeekDays days={week.days} today={data.today} />
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4">
			<WeekLinesTable
				{week}
				timezone={data.timezone}
				onAdjust={(line) => (adjusting = line)}
				onPay={(line) => (paying = line)}
			/>
			<div class="flex flex-wrap items-center gap-3">
				<p class="text-xl">
					Итого к выплате:
					<span class="font-medium tabular-nums" data-testid="week-total">
						{roubles(week.totalPayoutMinor)}
					</span>
				</p>
				<div class="flex flex-wrap gap-2 sm:ml-auto">
					<!-- A file with a query string: a built url the client router must not render. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class={buttonVariants({ variant: 'secondary' })}
						href={sheetHref}
						download
						data-sveltekit-reload
					>
						Ведомость XLSX
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{#if week.canManage && week.status === 'open'}
						<Button onclick={() => (confirming = 'close')}>Закрыть неделю</Button>
					{:else if week.canManage && week.status === 'calculated'}
						<Button variant="secondary" onclick={() => (confirming = 'reopen')}>
							Открыть неделю
						</Button>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<AdjustModal line={adjusting} week={week.startsOn} onClose={() => (adjusting = null)} />
<WeekActionModal
	open={confirming === 'close'}
	title="Закрыть неделю?"
	description="Ведомость зафиксируется: дни, работы и корректировки этой недели нельзя будет менять, пока неделю не откроют снова."
	action="?/close"
	field="week"
	value={week.startsOn}
	submitLabel="Закрыть неделю"
	success="Неделя закрыта"
	onClose={() => (confirming = null)}
/>
<WeekActionModal
	open={confirming === 'reopen'}
	title="Открыть неделю?"
	description="Дни и корректировки снова можно будет менять. Причина попадёт в журнал."
	action="?/reopen"
	field="periodId"
	value={week.periodId ?? 0}
	comment={{ label: 'Причина', placeholder: 'Введите причину', required: true }}
	submitLabel="Открыть неделю"
	success="Неделя открыта"
	onClose={() => (confirming = null)}
/>
<WeekActionModal
	open={paying !== null}
	title="Отметить выплату?"
	description={paying ? `${paying.fullName}: ${roubles(paying.payoutMinor)}` : ''}
	action="?/pay"
	field="lineId"
	value={paying?.id ?? 0}
	comment={{ label: 'Комментарий', placeholder: 'Введите комментарий', required: false }}
	submitLabel="Выплачено"
	success="Выплата отмечена"
	onClose={() => (paying = null)}
/>
