<script lang="ts">
	import { resolve } from '$app/paths';
	import TelLink from './TelLink.svelte';

	let {
		phone,
		address,
		telHref
	}: { phone: string | null; address: string | null; telHref: `tel:${string}` | null } = $props();

	const year = new Date().getFullYear();
</script>

<footer class="mx-auto mb-6 w-full max-w-shell px-4 sm:px-6">
	<div class="rounded-card bg-surface-raised px-6 pt-12 pb-6 sm:px-10">
		<div class="grid grid-cols-1 gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
			<div>
				<div class="mb-3 font-heading text-2xl font-semibold tracking-[0.14em]">АНГЕЛ</div>
				<p class="max-w-xs text-fg-muted">
					Столярная мастерская по производству гробов и ритуальных изделий.
				</p>
			</div>
			<div class="flex flex-col gap-3">
				<div class="text-xs tracking-[0.12em] text-fg-faint uppercase">Контакты</div>
				{#if phone && telHref}<TelLink href={telHref} class="hover:text-brand">{phone}</TelLink
					>{/if}
				{#if address}<span class="text-fg-muted">{address}</span>{/if}
			</div>
			<div class="flex flex-col gap-3">
				<div class="text-xs tracking-[0.12em] text-fg-faint uppercase">Портал</div>
				<a href={resolve('/login')} class="hover:text-brand">Вход для контрагентов</a>
				<a href={resolve('/password/reset')} class="hover:text-brand">Восстановить доступ</a>
			</div>
		</div>
		<div class="mt-12 text-sm text-fg-faint">© {year} Мастерская «Ангел»</div>
	</div>
</footer>
