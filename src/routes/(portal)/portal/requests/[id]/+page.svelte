<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import RequestComposition from '$lib/portal/requests/RequestComposition.svelte';
	import RequestThread from '$lib/portal/requests/RequestThread.svelte';
	import {
		Breadcrumbs,
		Button,
		Card,
		ErrorState,
		PriceCell,
		StatusBadge,
		Stepper,
		withToast
	} from '$lib/ui';
	import { formatDate, formatDateTime } from '$lib/utils/format';
	import type { RequestStatus } from '$lib/types/request';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const request = $derived(data.request);
	const canCancel = $derived(request.targets.includes('cancelled'));

	/** The moments the Stepper marks: one per status the request has already reached. */
	const reachedAt = $derived(
		Object.fromEntries(request.history.map((step) => [step.toStatus, step.createdAt])) as Partial<
			Record<RequestStatus, string>
		>
	);

	const failure = $derived(form && 'formError' in form ? form.formError : undefined);
	const commentError = $derived(form && form.action === undefined ? failure : undefined);
</script>

<svelte:head><title>Заявка {request.number}</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="px-2">
		<Breadcrumbs
			items={[
				{ label: 'Главная', href: resolve('/portal') },
				{ label: 'Мои заявки', href: resolve('/portal/requests') },
				{ label: request.number }
			]}
		/>
	</div>

	<div class="flex flex-wrap items-end gap-4 px-2">
		<div class="flex flex-col gap-2">
			<div class="flex flex-wrap items-center gap-3">
				<h1 data-testid="request-number" class="text-4xl">Заявка {request.number}</h1>
				<StatusBadge status={request.status} />
			</div>
			<p class="text-fg-muted">
				{#if request.submittedAt}Отправлена {formatDate(request.submittedAt, data.timezone)}{/if}
				{#if request.authorName}
					· автор {request.authorName}{/if}
				{#if request.externalNumber}
					· ваш номер {request.externalNumber}{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-3 sm:ml-auto">
			<form
				method="POST"
				action="/portal/cart?/repeat"
				use:enhance={withToast({ success: 'Позиции заявки скопированы в корзину' })}
			>
				<input type="hidden" name="requestId" value={request.id} />
				<Button type="submit" variant="secondary" data-testid="repeat-request">
					Повторить заявку
				</Button>
			</form>
			{#if canCancel}
				<form
					method="POST"
					action="?/cancel"
					use:enhance={withToast({ success: `Заявка ${request.number} отменена` })}
				>
					<Button type="submit" variant="danger" data-testid="cancel-request">
						Отменить заявку
					</Button>
				</form>
			{/if}
		</div>
	</div>

	{#if failure}
		<div data-testid="request-error"><ErrorState title={failure} /></div>
	{/if}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
		<div class="flex flex-col gap-6">
			<Card.Root>
				<Card.Content class="flex flex-col gap-4">
					<h2 class="text-2xl">Состав заявки</h2>
					<RequestComposition {request} canSeePrices={data.user.canSeePrices} />
					{#if request.totalMinor !== undefined}
						<dl data-testid="request-totals" class="flex flex-col gap-1 self-end text-right">
							<div class="flex justify-between gap-6">
								<dt class="text-fg-muted">Позиции</dt>
								<dd><PriceCell valueMinor={request.itemsTotalMinor} /> ₽</dd>
							</div>
							<div class="flex justify-between gap-6">
								<dt class="text-fg-muted">Скидка по договору {request.discountPercent} %</dt>
								<dd><PriceCell valueMinor={request.discountMinor} /> ₽</dd>
							</div>
							<div class="flex justify-between gap-6 text-lg">
								<dt>К оплате</dt>
								<dd><PriceCell valueMinor={request.totalMinor} /> ₽</dd>
							</div>
							{#if request.charityAmountMinor !== undefined}
								<div
									data-testid="request-charity"
									class="flex justify-between gap-6 text-tone-info"
								>
									<dt>В фонд с этой заявки</dt>
									<dd><PriceCell valueMinor={request.charityAmountMinor} /> ₽</dd>
								</div>
							{/if}
						</dl>
					{/if}
				</Card.Content>
			</Card.Root>

			<RequestThread
				requestId={request.id}
				comments={request.comments}
				attachments={request.attachments}
				timeZone={data.timezone}
				formError={commentError}
			/>
		</div>

		<div class="flex flex-col gap-6">
			<Card.Root>
				<Card.Content class="flex flex-col gap-4">
					<h2 class="text-2xl">Статус</h2>
					<Stepper current={request.status} {reachedAt} timeZone={data.timezone} />
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Content class="flex flex-col gap-3">
					<h2 class="text-2xl">Параметры заявки</h2>
					<dl data-testid="request-shipment" class="flex flex-col gap-2">
						<div class="flex justify-between gap-4">
							<dt class="text-fg-muted">Адрес доставки</dt>
							<dd class="text-right">{request.deliveryAddress ?? '—'}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-fg-muted">Срок доставки</dt>
							<dd class="text-right">
								{request.deliveryAt ? formatDateTime(request.deliveryAt, data.timezone) : '—'}
							</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-fg-muted">ФИО умершего</dt>
							<dd class="text-right">{request.deceasedName ?? '—'}</dd>
						</div>
					</dl>
					{#if request.comment}
						<p data-testid="request-comment">Комментарий: {request.comment}</p>
					{/if}
					{#if data.counterparty.manager}
						<p class="border-t border-border pt-3 text-fg-muted">
							Менеджер {data.counterparty.manager.fullName}
							{#if data.counterparty.manager.phone}
								· {data.counterparty.manager.phone}{/if}
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
