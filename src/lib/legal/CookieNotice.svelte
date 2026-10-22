<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/ui';

	/*
	 * Notice about the cookies of the public pages. The site keeps only the cookies it needs to sign
	 * in, so the notice informs and asks nothing. Hidden until the browser says it was not closed:
	 * the server render never flashes it at a guest who closed it before.
	 */
	const CLOSED_KEY = 'cookie-notice-closed';

	let open = $state(false);

	$effect(() => {
		try {
			open = localStorage.getItem(CLOSED_KEY) !== '1';
		} catch {
			open = true;
		}
	});

	function close(): void {
		open = false;
		try {
			localStorage.setItem(CLOSED_KEY, '1');
		} catch {
			// Storage is off in a private window: the notice comes back next time, nothing breaks.
		}
	}
</script>

{#if open}
	<div
		role="region"
		aria-label="Сообщение о cookie"
		data-testid="cookie-notice"
		class="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6"
	>
		<div
			class="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-card bg-surface-raised p-4 shadow-overlay sm:flex-nowrap sm:px-6"
		>
			<p class="flex-1 text-sm text-fg-muted">
				Сайт сохраняет cookie, без них не работает вход в портал. Подробнее в
				<a class="text-link underline" href={resolve('/legal/cookies')}
					>соглашении об использовании cookie</a
				>.
			</p>
			<Button size="sm" onclick={close}>Понятно</Button>
		</div>
	</div>
{/if}
