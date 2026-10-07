<script lang="ts">
	import { installState } from './install.svelte';
	import TouchButton from './TouchButton.svelte';

	/*
	 * The install entry of tech.md 17.4: a button where the browser offers an install, a short
	 * instruction on iOS, nothing once the app runs from the home screen.
	 */
	$effect(() => installState.watch());
</script>

{#if !installState.standalone}
	{#if installState.canPrompt}
		<TouchButton
			variant="secondary"
			data-testid="install-app"
			onclick={() => void installState.prompt()}
		>
			Установить приложение
		</TouchButton>
	{:else if installState.ios}
		<p data-testid="install-ios-hint" class="text-sm text-fg-muted">
			Чтобы установить приложение, нажмите «Поделиться», затем «На экран Домой».
		</p>
	{/if}
{/if}
