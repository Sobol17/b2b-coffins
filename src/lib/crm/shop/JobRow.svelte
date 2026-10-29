<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { colourTitle, positionTitle } from '$lib/crm/shop/labels';
	import { Checkbox, NumberInput, TouchButton, withToast } from '$lib/ui';
	import type { ShopJobDto } from '$lib/types/crm-shop';

	let { job, open }: { job: ShopJobDto; open: boolean } = $props();

	let form: HTMLFormElement | undefined = $state();
	// One piece is a tick: a change of the box saves it at once, the server keeps the count.
	let ticked = $derived(job.doneQty >= job.qty);
	// The box sits in the DOM with its new state only after Svelte flushes, so submit after that.
	function toggle(): void {
		void tick().then(() => form?.requestSubmit());
	}
</script>

<li class="flex flex-col gap-2 border-t border-border pt-3" data-testid="shop-job">
	<div class="flex flex-wrap gap-x-3 gap-y-1">
		<span class="flex-1 font-medium">{positionTitle(job)} · {colourTitle(job)}</span>
		<span class="text-sm">Артикул {job.sku}</span>
	</div>
	{#if job.engraving}
		<p class="text-sm">Гравировка: {job.engraving}</p>
	{/if}
	{#if job.comment}
		<p class="text-sm text-fg-muted">{job.comment}</p>
	{/if}
	<p class="text-sm" data-testid="shop-job-count">
		Нужно {job.qty} шт · Сделано {job.doneQty} из {job.qty}
	</p>
	{#if open}
		<form
			bind:this={form}
			method="POST"
			action="?/progress"
			class="flex flex-wrap items-end gap-3"
			use:enhance={withToast({ success: 'Отмечено' })}
		>
			<input type="hidden" name="jobId" value={job.id} />
			{#if job.qty === 1}
				<!-- The hidden zero goes first: a ticked box sends its 1 after it and wins. -->
				<input type="hidden" name="doneQty" value="0" />
				<!-- The click of the box or its label bubbles here; the box handles the keyboard itself. -->
				<div class="flex min-h-11 items-center" onclick={toggle} role="none">
					<Checkbox label="Сделано" name="doneQty" value="1" bind:checked={ticked} />
				</div>
			{:else}
				<div class="w-28">
					<NumberInput
						label="Сделано"
						name="doneQty"
						value={job.doneQty}
						min={0}
						max={job.qty}
						placeholder="Введите число"
					/>
				</div>
				<TouchButton type="submit" variant="secondary">Сохранить</TouchButton>
			{/if}
		</form>
		{#if job.qty > 1 && job.doneQty < job.qty}
			<form method="POST" action="?/progress" use:enhance={withToast({ success: 'Отмечено' })}>
				<input type="hidden" name="jobId" value={job.id} />
				<input type="hidden" name="doneQty" value={job.qty} />
				<TouchButton type="submit" variant="ghost">Сделано всё</TouchButton>
			</form>
		{/if}
	{/if}
</li>
