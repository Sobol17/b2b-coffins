<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Modal, withToast } from '$lib/ui';
	import type { StaffDto } from '$lib/types/crm-payroll';

	/* One dialog for a new worker and for an edit of one. */
	let {
		open,
		worker,
		onClose
	}: {
		open: boolean;
		/** Null for a new worker. */
		worker: StaffDto | null;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal {open} title={worker ? 'Изменить сотрудника' : 'Новый сотрудник'} {onClose}>
	{#snippet body()}
		<form
			method="POST"
			action={worker ? '?/update' : '?/create'}
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: worker ? 'Сотрудник сохранён' : 'Сотрудник добавлен',
				onSuccess: onClose
			})}
		>
			{#if worker}<input type="hidden" name="id" value={worker.id} />{/if}
			<Input
				name="fullName"
				label="ФИО"
				placeholder="Введите ФИО"
				value={worker?.fullName ?? ''}
				required
				maxlength={120}
			/>
			<Input
				name="position"
				label="Должность"
				placeholder="Введите должность"
				value={worker?.position ?? ''}
				maxlength={120}
			/>
			<Button type="submit" loading={pending} class="self-start">
				{worker ? 'Сохранить' : 'Добавить'}
			</Button>
		</form>
	{/snippet}
</Modal>
