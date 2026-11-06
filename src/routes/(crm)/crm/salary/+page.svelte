<script lang="ts">
	import { resolve } from '$app/paths';
	import { addDays } from '$lib/domain/payroll/calc';
	import { dayTitle, roubles } from '$lib/crm/payroll/labels';
	import { stationTitle } from '$lib/crm/shop/labels';
	import { buttonVariants, Card, EmptyState } from '$lib/ui';
	import { formatDateTime } from '$lib/utils/format';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const salary = $derived(data.salary);
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
						{roubles(salary.pendingMinor)}
					</p></Card.Content
				></Card.Root
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
					><p class="text-sm text-fg-muted">К выплате</p>
					<p class="mt-2 text-3xl tabular-nums" data-testid="salary-payout">
						{roubles(salary.line.payoutMinor)}
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
				Выплачено {formatDateTime(salary.line.paidAt, data.timezone)}
			</p>{/if}
	{:else}
		<EmptyState
			title="Сотрудник пока не привязан"
			description="Администратор должен связать вашу учётную запись с сотрудником в разделе выплат."
		/>
	{/if}
	{#if salary.pending.length}
		<Card.Root
			><Card.Header><Card.Title>Ожидают подтверждения</Card.Title></Card.Header><Card.Content>
				<ul class="flex flex-col divide-y divide-border">
					{#each salary.pending as work (`${work.unitId}:${work.station}`)}
						<li class="flex flex-wrap justify-between gap-2 py-3">
							<div>
								<p class="font-medium">Ящик №{work.unitId} · {work.productTitle}</p>
								<p class="text-sm text-fg-muted">
									{stationTitle(work.station)} · {formatDateTime(work.completedAt, data.timezone)}
								</p>
							</div>
							<p class="tabular-nums">{roubles(work.shareMinor)}</p>
						</li>
					{/each}
				</ul>
			</Card.Content></Card.Root
		>
	{/if}
</div>
