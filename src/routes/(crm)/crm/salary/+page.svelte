<script lang="ts">
	import { resolve } from '$app/paths';
	import { addDays } from '$lib/domain/payroll/calc';
	import { dayTitle, roubles } from '$lib/crm/payroll/labels';
	import { stationTitle } from '$lib/crm/shop/labels';
	import { buttonVariants, Card, EmptyState, TONE_CLASS, type StatusTone } from '$lib/ui';
	import type { OwnPayrollWorkDto } from '$lib/types/crm-payroll';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const salary = $derived(data.salary);
	const awaitingCrewCount = $derived(
		salary.works.filter((work) => work.status === 'awaiting_crew').length
	);
	const workStatus: Record<OwnPayrollWorkDto['status'], { title: string; tone: StatusTone }> = {
		awaiting_crew: { title: 'Ждёт состава бригады', tone: 'warning' },
		awaiting_confirmation: { title: 'Ждёт подтверждения', tone: 'progress' },
		confirmed: { title: 'Начислено', tone: 'info' },
		paid: { title: 'Выплачено', tone: 'success' }
	};
	const weekHref = (date: string) => `${resolve('/crm/salary')}?week=${date}`;
</script>

<svelte:head><title>Моя зарплата</title></svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
	<div>
		<h1 class="mb-2 text-3xl">Моя зарплата</h1>
		<p class="text-fg-muted">
			Неделя {dayTitle(salary.week.startsOn)} – {dayTitle(salary.week.endsOn)}
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- Built URLs include a query string. -->
		<a
			class={buttonVariants({ variant: 'secondary' })}
			href={weekHref(addDays(salary.week.startsOn, -7))}>Предыдущая неделя</a
		>
		<a
			class={buttonVariants({ variant: 'secondary' })}
			href={weekHref(addDays(salary.week.startsOn, 7))}>Следующая неделя</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
	{#if salary.line}
		<div class="grid gap-4 sm:grid-cols-3">
			<Card.Root
				><Card.Content
					><p class="text-sm text-fg-muted">Ожидает подтверждения</p>
					<p class="mt-2 text-3xl tabular-nums" data-testid="salary-pending">
						{awaitingCrewCount > 0 && salary.pendingMinor === 0
							? 'Ждёт расчёта'
							: roubles(salary.pendingMinor)}
					</p>
					{#if awaitingCrewCount > 0}
						<p class="mt-2 text-sm text-fg-muted">
							Работ без состава бригады: {awaitingCrewCount}. Их доля пока не рассчитана.
						</p>
					{/if}
				</Card.Content></Card.Root
			>
			<Card.Root
				><Card.Content
					><p class="text-sm text-fg-muted">Начислено</p>
					<p class="mt-2 text-3xl tabular-nums" data-testid="salary-accrued">
						{roubles(salary.line.accruedMinor)}
					</p></Card.Content
				></Card.Root
			>
			<Card.Root
				><Card.Content
					><p class="text-sm text-fg-muted">Осталось выплатить</p>
					<p class="mt-2 text-3xl tabular-nums" data-testid="salary-payout">
						{roubles(salary.line.paidAt ? 0 : salary.line.payoutMinor)}
					</p></Card.Content
				></Card.Root
			>
		</div>
		<p class="text-sm text-fg-muted">
			Предварительная сумма станет начислением после подтверждения администратором. Столярная доля
			зависит от отмеченного состава дня.
		</p>
		{#if salary.line.adjustmentComment}<p>
				Корректировка: {roubles(salary.line.adjustmentMinor)} · {salary.line.adjustmentComment}
			</p>{/if}
		{#if salary.line.paidAt}<p data-testid="salary-paid">
				Выплачено {roubles(salary.line.payoutMinor)} · {formatDateTime(
					salary.line.paidAt,
					data.timezone
				)}
			</p>{/if}
	{:else}
		<EmptyState
			title="Сотрудник пока не привязан"
			description="Администратор должен связать вашу учётную запись с сотрудником в разделе выплат."
		/>
	{/if}
	{#if salary.line}
		<Card.Root
			><Card.Header><Card.Title>Журнал работ</Card.Title></Card.Header><Card.Content>
				<p class="mb-3 text-sm text-fg-muted">
					В строке показана ваша доля, округлённая вниз до рубля. Итог начисления округляется один
					раз за день и может отличаться от суммы строк. До подтверждения доля предварительная.
				</p>
				{#if salary.works.length}
					<ul class="flex flex-col divide-y divide-border" data-testid="salary-works">
						{#each salary.works as work (`${work.unitId}:${work.station}`)}
							<li class="flex flex-wrap justify-between gap-3 py-3" data-testid="salary-work">
								<div>
									<p class="font-medium">Ящик №{work.unitId} · {work.productTitle}</p>
									<p class="text-sm text-fg-muted">
										{stationTitle(work.station)} · Рабочий день {dayTitle(work.workDate)}
									</p>
									<p class="text-sm text-fg-muted">
										Завершено {formatDateTime(work.completedAt, data.timezone)}
									</p>
								</div>
								<div class="flex flex-col items-start gap-2 sm:items-end">
									<p class="tabular-nums">
										{work.shareMinor === null
											? 'Доля пока не рассчитана'
											: roubles(work.shareMinor)}
									</p>
									<span
										class={[
											'rounded-pill px-2 py-0.5 text-xs',
											TONE_CLASS[workStatus[work.status].tone]
										]}>{workStatus[work.status].title}</span
									>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<EmptyState
						title="За эту неделю завершённых работ пока нет"
						description="Здесь появятся ваши работы и доли в столярной бригаде."
					/>
				{/if}
			</Card.Content></Card.Root
		>
	{/if}
</div>
