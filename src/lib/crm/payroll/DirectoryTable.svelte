<script lang="ts" generics="TRow extends { id: number; isActive: boolean }">
	import { enhance } from '$app/forms';
	import EntityList from '$lib/crm/EntityList.svelte';
	import { Button, TONE_CLASS, withToast } from '$lib/ui';
	import type { Snippet } from 'svelte';

	/*
	 * The crew and the works are short lists with the same actions: edit, switch off, switch on.
	 * The page draws what a row says about itself; the status and the actions are drawn here.
	 */
	let {
		rows,
		canManage,
		emptyTitle,
		statusTitle,
		nameOf,
		onEdit,
		own
	}: {
		rows: readonly TRow[];
		canManage: boolean;
		emptyTitle: string;
		/** How the page words an active and a switched-off row. */
		statusTitle: { readonly on: string; readonly off: string };
		nameOf: (row: TRow) => string;
		onEdit: (row: TRow) => void;
		/** The second line of a row: the page's own facts about it. */
		own: Snippet<[TRow]>;
	} = $props();
</script>

<EntityList {rows} {emptyTitle} actions={canManage ? actions : undefined}>
	{#snippet item(row: TRow)}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span class="font-medium" data-testid="directory-name">{nameOf(row)}</span>
			<span
				data-testid="directory-status"
				class={[
					'inline-flex rounded-pill px-2.5 py-0.5 text-xs',
					TONE_CLASS[row.isActive ? 'success' : 'neutral']
				]}
			>
				{row.isActive ? statusTitle.on : statusTitle.off}
			</span>
		</div>
		<div class="text-sm text-fg-muted">{@render own(row)}</div>
	{/snippet}
</EntityList>

{#snippet actions(row: TRow)}
	<Button variant="secondary" size="sm" onclick={() => onEdit(row)}>Изменить</Button>
	<form
		method="POST"
		action={row.isActive ? '?/disable' : '?/enable'}
		use:enhance={withToast({
			success: row.isActive ? `Выключено: ${nameOf(row)}` : `Включено: ${nameOf(row)}`
		})}
	>
		<input type="hidden" name="id" value={row.id} />
		<Button
			type="submit"
			variant="ghost"
			size="sm"
			class={row.isActive ? 'text-danger' : undefined}
		>
			{row.isActive ? 'Выключить' : 'Включить'}
		</Button>
	</form>
{/snippet}
