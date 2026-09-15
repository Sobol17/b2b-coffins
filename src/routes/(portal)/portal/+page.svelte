<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Card, PriceCell } from '$lib/ui';
	import { formatDate } from '$lib/utils/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Портал контрагента</title></svelte:head>

<div class="flex flex-col gap-6">
	<h1 data-testid="portal-home" class="px-2 pt-4 text-4xl sm:text-5xl">Портал контрагента</h1>

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
