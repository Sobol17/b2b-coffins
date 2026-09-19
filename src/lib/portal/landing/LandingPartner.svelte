<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, buttonVariants } from '$lib/ui';
	import TelLink from './TelLink.svelte';

	// Closing block of the landing: the call the guest answers by phone or by the login form.
	let { telHref }: { telHref: `tel:${string}` | null } = $props();
</script>

<section class="mx-auto max-w-shell px-4 pt-12 pb-10 sm:px-6">
	<div
		class="grid grid-cols-1 items-center gap-8 rounded-card bg-surface-raised p-8 sm:p-11 lg:grid-cols-[1fr_auto]"
	>
		<div>
			<h3 class="mb-2 text-3xl">Работаем с юридическими лицами и ИП</h3>
			<p class="max-w-2xl text-fg-muted">
				Договор поставки, закрывающие документы, отгрузка со склада ежедневно. Постоянным партнёрам
				фиксированный график доставки и отсрочка по договору.
			</p>
		</div>
		{#if telHref}
			<TelLink href={telHref} class={buttonVariants({ size: 'lg' })}>Стать партнёром</TelLink>
		{:else}
			<Button size="lg" href={resolve('/login')}>Вход в портал</Button>
		{/if}
	</div>
</section>
