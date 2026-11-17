<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Pencil, Trash2 } from '@lucide/svelte';
	import { Button, ConfirmDialog, withToast } from '$lib/ui';
	import * as Tooltip from '$lib/ui/base/tooltip/index.js';
	import type { CrmPriceListDto } from '$lib/types/crm-catalog';

	let { list, onEdit }: { list: CrmPriceListDto; onEdit: () => void } = $props();
	let deleteOpen = $state(false);
	let deleteForm: HTMLFormElement;
	const period = $derived(`${list.validFrom ?? 'без начала'} — ${list.validTo ?? 'без конца'}`);
</script>

<li
	class="relative isolate flex items-center gap-3 rounded-xl px-3 py-3 focus-within:bg-surface-muted hover:bg-surface-muted"
>
	<div class="min-w-0 flex-1">
		<strong>
			<a
				href={resolve(`/crm/prices/${list.id}`)}
				aria-label={`Позиции прайс-листа ${list.title}`}
				class="break-words after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2"
				>{list.title}</a
			>
		</strong>
		<p class="text-sm text-fg-muted">
			{list.isBase ? 'Базовый' : 'Персональный'} · {period} · позиций: {list.items.length}
		</p>
	</div>
	<div class="relative z-10 flex shrink-0 items-center gap-1">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						class="size-11 p-0"
						aria-label="Изменить"
						onclick={onEdit}
					>
						<Pencil aria-hidden="true" />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content role="tooltip">Изменить прайс-лист</Tooltip.Content>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						class="size-11 p-0 text-danger hover:text-danger"
						aria-label="Удалить"
						onclick={() => (deleteOpen = true)}
					>
						<Trash2 aria-hidden="true" />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content role="tooltip">Удалить прайс-лист</Tooltip.Content>
		</Tooltip.Root>
	</div>
	<form
		class="hidden"
		bind:this={deleteForm}
		method="POST"
		action="?/deleteList"
		use:enhance={withToast({ success: 'Прайс-лист удалён' })}
	>
		<input type="hidden" name="id" value={list.id} />
	</form>
</li>
<ConfirmDialog
	bind:open={deleteOpen}
	title="Удалить прайс-лист?"
	description={list.title}
	confirmLabel="Удалить"
	danger
	onConfirm={() => deleteForm.requestSubmit()}
/>
