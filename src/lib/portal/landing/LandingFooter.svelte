<script lang="ts">
	import { resolve } from '$app/paths';
	import { LEGAL_DOCS } from '$lib/legal/docs';
	import type { PublicContacts } from '$lib/types/landing';
	import TelLink from './TelLink.svelte';

	let { contacts, telHref }: { contacts: PublicContacts; telHref: `tel:${string}` | null } =
		$props();

	const year = new Date().getFullYear();
	const operator = $derived(contacts.operator);
	// The seller is named with its tax numbers: what a buyer checks before a supply contract.
	const requisites = $derived(
		[
			operator?.inn ? `ИНН ${operator.inn}` : null,
			operator?.ogrn ? `${operator.ogrn.length === 15 ? 'ОГРНИП' : 'ОГРН'} ${operator.ogrn}` : null
		].filter((part) => part !== null)
	);
</script>

<footer class="mx-auto mb-6 w-full max-w-shell px-4 sm:px-6">
	<div class="rounded-card bg-surface-raised px-6 pt-12 pb-6 sm:px-10">
		<div class="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
			<div>
				<div class="mb-3 font-heading text-2xl font-semibold tracking-[0.14em]">АНГЕЛ</div>
				<p class="max-w-xs text-fg-muted">
					Фабрика еврогробов: гробы, кресты и ритуальные изделия собственного производства.
				</p>
			</div>
			<div class="flex flex-col gap-3">
				<div class="text-xs tracking-[0.12em] text-fg-faint uppercase">Контакты</div>
				{#if contacts.phone && telHref}
					<TelLink href={telHref} class="hover:text-link">{contacts.phone}</TelLink>
				{/if}
				{#if operator?.email}
					<a href="mailto:{operator.email}" class="hover:text-link">{operator.email}</a>
				{/if}
				{#if contacts.address}<span class="text-fg-muted">{contacts.address}</span>{/if}
			</div>
			<div class="flex flex-col gap-3">
				<div class="text-xs tracking-[0.12em] text-fg-faint uppercase">Портал</div>
				<a href={resolve('/login')} class="hover:text-link">Вход для контрагентов</a>
				<a href={resolve('/password/reset')} class="hover:text-link">Восстановить доступ</a>
			</div>
			<nav aria-label="Документы" class="flex flex-col gap-3">
				<div class="text-xs tracking-[0.12em] text-fg-faint uppercase">Документы</div>
				{#each LEGAL_DOCS as doc (doc.href)}
					<a href={doc.href} class="hover:text-link">{doc.title}</a>
				{/each}
			</nav>
		</div>
		<div
			data-testid="footer-operator"
			class="mt-12 flex flex-col gap-1 text-sm text-fg-faint sm:flex-row sm:flex-wrap sm:gap-x-4"
		>
			<span>© {year} {operator?.name ?? 'Фабрика еврогробов «Ангел»'}</span>
			{#each requisites as part (part)}<span>{part}</span>{/each}
		</div>
	</div>
</footer>
