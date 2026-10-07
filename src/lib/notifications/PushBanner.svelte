<script lang="ts">
	import { Button, Card, toast, TouchButton } from '$lib/ui';
	import { pushStateFor } from './push-state.svelte';

	/*
	 * The nudge next to the install prompt: shown while this device could take pushes and does not.
	 * «Не сейчас» is remembered on the device, so the banner does not nag on every screen.
	 */
	let { publicKey }: { publicKey: string } = $props();

	const CLOSED_KEY = 'push-banner-closed';
	const push = $derived(pushStateFor(publicKey));
	let closed = $state(true);

	$effect(() => {
		try {
			closed = localStorage.getItem(CLOSED_KEY) === '1';
		} catch {
			// Storage can be blocked; the banner then simply shows.
			closed = false;
		}
	});

	function close(): void {
		closed = true;
		try {
			localStorage.setItem(CLOSED_KEY, '1');
		} catch {
			// Not remembered: the banner comes back on the next visit.
		}
	}

	async function enable(): Promise<void> {
		try {
			await push.enable();
			if (push.status === 'on') toast.success('Уведомления включены');
		} catch {
			toast.error('Не удалось включить уведомления');
		}
	}
</script>

{#if push.ready && push.status === 'off' && !closed}
	<Card.Root data-testid="push-banner">
		<Card.Content class="flex flex-wrap items-center gap-3">
			<p class="flex-1">Включите уведомления, чтобы узнавать о заявках сразу</p>
			<TouchButton loading={push.busy} data-testid="push-banner-enable" onclick={enable}>
				Включить
			</TouchButton>
			<Button variant="ghost" onclick={close}>Не сейчас</Button>
		</Card.Content>
	</Card.Root>
{/if}
