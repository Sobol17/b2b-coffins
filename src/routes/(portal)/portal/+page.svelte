<script lang="ts">
	import { resolve } from '$app/paths';
	import CharityBanner from '$lib/portal/charity/CharityBanner.svelte';
	import { Button, Card, PriceCell, StatusBadge } from '$lib/ui';
	import { formatDate } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Портал контрагента</title></svelte:head>

<div class="flex flex-col gap-6">
	<h1 data-testid="portal-home" class="px-2 pt-4 text-4xl sm:text-5xl">Портал контрагента</h1>

	{#if data.charity}
		<CharityBanner banner={data.charity} />
	{/if}

	<div class="grid gap-6 md:grid-cols-2">
		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				<h2 class="text-2xl">Собрать заявку</h2>
				<p class="text-fg-muted">
					Подбор моделей по каталогу, размеры, отделка и наличие на складе.
				</p>
				<Button href={resolve('/portal/catalog')} class="self-start">Открыть каталог</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				<h2 class="text-2xl">Повторить заявку</h2>
				{#if data.lastRequest}
					<p data-testid="last-request" class="text-fg-muted">
						Заявка {data.lastRequest.number}{#if data.lastRequest.submittedAt}
							от {formatDate(data.lastRequest.submittedAt, data.timezone)}{/if}: позиций
						{data.lastRequest.itemCount}, изделий {data.lastRequest
							.unitCount}{#if data.lastRequest.totalMinor !== undefined},
							<PriceCell valueMinor={data.lastRequest.totalMinor} /> ₽{/if}.
					</p>
					<!-- A plain post: the action answers with a redirect to the cart, a full navigation is what we want. -->
					<form method="POST" action="/portal/cart?/repeat" class="self-start">
						<input type="hidden" name="requestId" value={data.lastRequest.id} />
						<Button type="submit" variant="secondary" data-testid="repeat-request">
							Повторить в заявку
						</Button>
					</form>
				{:else}
					<p class="text-fg-muted">
						Отправленных заявок пока нет. Первую отправленную заявку можно будет повторить в один
						клик.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="md:col-span-2">
			<Card.Content class="flex flex-col gap-3">
				<h2 class="text-2xl">Заявки в работе</h2>
				{#if data.activeRequests.length === 0}
					<p class="text-fg-muted">Активных заявок нет. Соберите новую заявку из каталога.</p>
				{:else}
					<ul data-testid="active-requests" class="flex flex-col gap-2">
						{#each data.activeRequests as row (row.id)}
							<li class="flex flex-wrap items-center gap-3">
								<a class="underline" href={resolve(`/portal/requests/${row.id}`)}>{row.number}</a>
								<StatusBadge status={row.status} />
								<span class="text-fg-muted">{row.firstItemTitle ?? 'Позиции не указаны'}</span>
								{#if row.totalMinor !== undefined}
									<span class="ml-auto"><PriceCell valueMinor={row.totalMinor} /> ₽</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				<Button variant="secondary" href={resolve('/portal/requests')} class="self-start">
					Все заявки
				</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				<h2 class="text-2xl">Мой аккаунт</h2>
				<p class="text-fg-muted">Контактные данные и пароль для входа в портал.</p>
				<Button variant="secondary" href={resolve('/portal/profile')} class="self-start">
					Открыть профиль
				</Button>
			</Card.Content>
		</Card.Root>
	</div>
</div>
