<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROLE_LABEL } from '$lib/portal/staff/labels';
	import { Button, Card, PriceCell } from '$lib/ui';
	import type { CounterpartyCardDto } from '$lib/types/counterparty';
	import { formatDate } from '$lib/utils/format';

	let {
		card,
		canManageStaff,
		timeZone
	}: { card: CounterpartyCardDto; canManageStaff: boolean; timeZone: string } = $props();

	const contractLine = $derived(
		card.contract
			? `Договор № ${card.contract.number}` +
					(card.contract.signedAt ? ` от ${formatDate(card.contract.signedAt, timeZone)}` : '')
			: 'Договор не загружен'
	);
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-6">
		<div>
			<h1 data-testid="counterparty-name" class="mb-2 text-4xl">{card.name}</h1>
			<p class="text-fg-muted">{contractLine}</p>
		</div>

		{#if card.debtMinor !== undefined}
			<div data-testid="counterparty-money" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="rounded-inset bg-surface-muted p-4">
					<div class="text-xs tracking-[0.1em] text-fg-faint uppercase">Задолженность</div>
					<div class="font-heading text-3xl font-semibold">
						<PriceCell valueMinor={card.debtMinor} /> ₽
					</div>
				</div>
				<div class="rounded-inset bg-surface-muted p-4">
					<div class="text-xs tracking-[0.1em] text-fg-faint uppercase">Закупка за год</div>
					<div class="font-heading text-3xl font-semibold">
						<PriceCell valueMinor={card.yearPurchasesMinor} /> ₽
					</div>
					<div class="text-sm text-fg-muted">отгрузок: {card.yearDeliveries ?? 0}</div>
				</div>
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Content class="flex flex-col gap-4">
		<div class="flex flex-wrap items-baseline gap-4">
			<h2 class="text-2xl">Сотрудники</h2>
			<span class="text-sm text-fg-faint">{card.staffCount} из {card.staffLimit} мест</span>
			{#if canManageStaff}
				<Button variant="ghost" href={resolve('/portal/staff')} class="sm:ml-auto">
					Все сотрудники
				</Button>
			{/if}
		</div>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
			{#each card.staffPreview as member (member.email)}
				<div class="rounded-inset bg-surface-muted p-4">
					<div class="text-xs tracking-[0.1em] text-fg-faint uppercase">
						{ROLE_LABEL[member.role]}
					</div>
					<div>{member.fullName}</div>
					<div class="text-sm text-fg-muted">
						{[member.phone, member.email].filter((part) => part !== null).join(' · ')}
					</div>
				</div>
			{/each}
		</div>
		{#if card.manager}
			<p
				data-testid="counterparty-manager"
				class="border-t border-border pt-4 text-sm text-fg-muted"
			>
				Администратор мастерской: <span class="text-fg">{card.manager.fullName}</span>
				{#if card.manager.phone}· {card.manager.phone}{/if} · {card.manager.email}
			</p>
		{/if}
	</Card.Content>
</Card.Root>
