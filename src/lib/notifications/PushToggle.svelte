<script lang="ts">
	import { Button, toast } from '$lib/ui';
	import { pushStateFor, type PushStatus } from './push-state.svelte';

	/* Push on this very device (tech.md 17.3). The permission prompt opens only from the click. */
	let { publicKey }: { publicKey: string } = $props();

	const push = $derived(pushStateFor(publicKey));

	const NOTE: Readonly<Partial<Record<PushStatus, string>>> = {
		blocked:
			'Уведомления запрещены в настройках браузера. Разрешите их для этого сайта и обновите страницу.',
		needs_install: 'Сначала установите приложение на экран Домой.',
		unsupported: 'Этот браузер не показывает уведомления.',
		unconfigured: 'Уведомления на устройства пока не настроены.'
	};

	async function enable(): Promise<void> {
		try {
			await push.enable();
			if (push.status === 'on') toast.success('Уведомления включены');
		} catch {
			toast.error('Не удалось включить уведомления');
		}
	}

	async function disable(): Promise<void> {
		try {
			await push.disable();
		} catch {
			toast.error('Не удалось отключить уведомления');
		}
	}
</script>

<div data-testid="push-toggle" class="flex flex-wrap items-center gap-3">
	{#if NOTE[push.status]}
		<p class="text-fg-muted">{NOTE[push.status]}</p>
	{:else if !push.ready}
		<p class="text-fg-muted">Проверяем уведомления на этом устройстве</p>
	{:else if push.status === 'on'}
		<p class="flex-1">Уведомления на этом устройстве включены</p>
		<Button variant="secondary" loading={push.busy} data-testid="push-disable" onclick={disable}>
			Отключить
		</Button>
	{:else}
		<Button loading={push.busy} data-testid="push-enable" onclick={enable}>
			Включить уведомления на этом устройстве
		</Button>
	{/if}
</div>
