<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import Button from './base/button/button.svelte';
	import BrandMark from './BrandMark.svelte';
	import { installState } from './install.svelte';

	/*
	 * The install offer on top of every screen of both contours (tech.md 17.4): a bar with a button
	 * where the browser can install, the two taps of Safari on iOS, nothing once the app runs from
	 * the home screen. The cross is remembered on the device, so the bar does not come back.
	 */
	const CLOSED_KEY = 'install-banner-closed';
	// Closed until the device is read: the server cannot know whether the app is installed.
	let closed = $state(true);

	$effect(() => installState.watch());
	$effect(() => {
		try {
			closed = localStorage.getItem(CLOSED_KEY) === '1';
		} catch {
			// Storage can be blocked; the bar then simply shows.
			closed = false;
		}
	});

	const offered = $derived(installState.canPrompt || installState.ios);

	function close(): void {
		closed = true;
		try {
			localStorage.setItem(CLOSED_KEY, '1');
		} catch {
			// Not remembered: the bar comes back on the next visit.
		}
	}
</script>

{#if offered && !installState.standalone && !closed}
	<aside
		aria-label="Установка приложения"
		data-testid="install-banner"
		class="flex items-center gap-3 bg-brand px-3 py-2 text-sm text-brand-fg sm:px-4"
	>
		<BrandMark class="size-9" />
		<p class="min-w-0 flex-1 leading-snug">
			{#if installState.canPrompt}
				Установите приложение: заявки и уведомления будут под рукой
			{:else}
				Добавьте приложение на экран «Домой»: нажмите «Поделиться», затем «На экран Домой»
			{/if}
		</p>
		{#if installState.canPrompt}
			<Button
				variant="secondary"
				size="sm"
				data-testid="install-banner-install"
				onclick={() => void installState.prompt()}
			>
				Установить
			</Button>
		{/if}
		<button
			type="button"
			aria-label="Скрыть предложение установки"
			data-testid="install-banner-close"
			class="flex size-11 shrink-0 items-center justify-center rounded-pill outline-none hover:bg-brand-fg/10 focus-visible:ring-3 focus-visible:ring-brand-fg/50"
			onclick={close}
		>
			<XIcon aria-hidden="true" class="size-5" />
		</button>
	</aside>
{/if}
