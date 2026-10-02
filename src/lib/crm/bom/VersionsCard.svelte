<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button, Card, TONE_CLASS, withToast } from '$lib/ui';
	import type { BomVersionDto } from '$lib/types/crm-bom';
	import { formatDateTime, pluralRu } from '$lib/utils/format';

	/** Versions of the norms, newest first. One is active; the others are history (C9). */
	let {
		versions,
		shownId,
		canManage,
		timeZone
	}: {
		versions: readonly BomVersionDto[];
		shownId: number | null;
		canManage: boolean;
		timeZone: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Версии</Card.Title>
		<Card.Description>
			Списание идёт по активной версии. Прежние версии хранятся и только читаются.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<ul class="flex flex-col gap-2" data-testid="bom-versions">
			{#each versions as version (version.id)}
				<li
					class={[
						'flex flex-wrap items-center gap-3 rounded-inset p-3',
						version.id === shownId ? 'bg-surface-muted' : ''
					]}
					data-testid="bom-version"
				>
					<span class="font-medium">Версия {version.version}</span>
					{#if version.isActive}
						<span class={['rounded-pill px-2 py-0.5 text-xs', TONE_CLASS.success]}>Активна</span>
					{/if}
					<span class="text-sm text-fg-muted">
						{version.sourceFileId === null ? 'вручную' : 'из файла'}
						· {formatDateTime(version.createdAt, timeZone)}
						{#if version.importedByName}· {version.importedByName}{/if}
						· {version.normCount}
						{pluralRu(version.normCount, ['норма', 'нормы', 'норм'])}
					</span>
					<div class="flex items-center gap-2 sm:ml-auto">
						{#if version.id !== shownId}
							<!-- The route is resolved; the version is a query string, not a route pattern. -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a class="text-link" href={`${resolve('/crm/stock/norms')}?version=${version.id}`}>
								Открыть
							</a>
						{/if}
						{#if canManage && !version.isActive}
							<form
								method="POST"
								action="?/activate"
								use:enhance={withToast({ success: `Версия ${version.version} активна` })}
							>
								<input type="hidden" name="versionId" value={version.id} />
								<Button type="submit" variant="ghost" size="sm">Сделать активной</Button>
							</form>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>
