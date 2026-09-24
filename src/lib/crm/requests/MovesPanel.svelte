<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ConfirmDialog, Modal, Select, Textarea, withToast } from '$lib/ui';
	import type { RequestStatus } from '$lib/types/request';

	/** Moves the state machine offers this actor; the server still checks every guard (tech.md 6). */
	let {
		targets,
		refusalReasons
	}: {
		targets: readonly RequestStatus[];
		refusalReasons: readonly { id: number; title: string }[];
	} = $props();

	const FORWARD: Partial<Record<RequestStatus, string>> = {
		in_work: 'Принять в работу',
		ready: 'Заявка собрана',
		delivered: 'Доставлено'
	};

	const forward = $derived(targets.filter((target) => FORWARD[target] !== undefined));
	let rejectOpen = $state(false);
	let cancelOpen = $state(false);
	let reasonId = $state('');
	let cancelForm = $state<HTMLFormElement>();
	const reasons = $derived(
		refusalReasons.map((row) => ({ value: String(row.id), label: row.title }))
	);
</script>

<div class="flex flex-wrap gap-2" data-testid="request-moves">
	{#each forward as target (target)}
		<form
			method="POST"
			action="?/move"
			use:enhance={withToast({ success: 'Статус заявки изменён' })}
		>
			<input type="hidden" name="to" value={target} />
			<Button type="submit">{FORWARD[target]}</Button>
		</form>
	{/each}
	{#if targets.includes('rejected')}
		<Button variant="secondary" onclick={() => (rejectOpen = true)}>Отклонить</Button>
	{/if}
	{#if targets.includes('cancelled')}
		<Button variant="ghost" class="text-danger" onclick={() => (cancelOpen = true)}>
			Отменить заявку
		</Button>
		<form
			bind:this={cancelForm}
			method="POST"
			action="?/move"
			class="hidden"
			use:enhance={withToast({ success: 'Заявка отменена' })}
		>
			<input type="hidden" name="to" value="cancelled" />
		</form>
	{/if}
</div>

<Modal bind:open={rejectOpen} title="Отклонить заявку">
	{#snippet body()}
		<form
			method="POST"
			action="?/move"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				success: 'Заявка отклонена',
				onSuccess: () => (rejectOpen = false)
			})}
		>
			<input type="hidden" name="to" value="rejected" />
			<Select
				label="Причина"
				options={reasons}
				placeholder="Выберите причину"
				bind:value={reasonId}
				required
			/>
			<input type="hidden" name="reasonId" value={reasonId} />
			<Textarea
				name="comment"
				label="Комментарий"
				placeholder="Введите комментарий"
				maxlength={500}
			/>
			<Button type="submit" variant="danger" class="self-start">Отклонить</Button>
		</form>
	{/snippet}
</Modal>

<ConfirmDialog
	bind:open={cancelOpen}
	title="Отменить заявку?"
	description="Отменённая заявка из потока не возвращается."
	confirmLabel="Отменить заявку"
	cancelLabel="Не отменять"
	danger
	onConfirm={() => {
		cancelForm?.requestSubmit();
		cancelOpen = false;
	}}
/>
