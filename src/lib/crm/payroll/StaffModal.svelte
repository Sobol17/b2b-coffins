<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Combobox, Input, Modal, MoneyInput, Select, withToast } from '$lib/ui';
	import type { StaffDto } from '$lib/types/crm-payroll';

	/* One dialog for a new worker and for an edit of one. */
	let {
		open,
		worker,
		users,
		formError,
		onClose
	}: {
		open: boolean;
		/** Null for a new worker. */
		worker: StaffDto | null;
		users: readonly { id: number; fullName: string }[];
		formError?: string | undefined;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
	let payRole = $derived(open && worker ? worker.payRole : 'piecework');
	const payOptions = [
		{ value: 'piecework', label: 'Работник цеха / сдельная оплата' },
		{ value: 'director', label: 'Руководитель · 350 ₽ за готовое изделие' },
		{ value: 'administrator', label: 'Администратор · 300 ₽ за готовое изделие' },
		{ value: 'driver', label: 'Водитель · 200 ₽ за доставленное изделие' },
		{ value: 'laborer', label: 'Разнорабочий · месячный оклад' }
	];
	const userOptions = $derived([
		{ value: '', label: 'Без учётной записи' },
		...users.map((user) => ({ value: String(user.id), label: user.fullName })),
		...(worker?.userId && !users.some((user) => user.id === worker.userId)
			? [{ value: String(worker.userId), label: 'Учётная запись недоступна' }]
			: [])
	]);
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
			{#if formError}
				<p role="alert" data-testid="staff-error" class="text-sm text-danger">{formError}</p>
			{/if}
			<Input
				name="fullName"
				label="ФИО"
				placeholder="Введите ФИО"
				value={worker?.fullName ?? ''}
				required
				maxlength={120}
			/>
			<Select
				name="payRole"
				placeholder="Выберите роль"
				label="Роль в выплатах"
				options={payOptions}
				bind:value={payRole}
			/>
			{#if payRole === 'laborer'}
				<input type="hidden" name="userId" value="" />
				<MoneyInput
					name="monthlySalaryMinor"
					placeholder="Введите оклад"
					label="Месячный оклад, ₽"
					valueMinor={worker?.monthlySalaryMinor ?? 6000000}
					required
				/>
				<p class="text-sm text-fg-muted">
					Расчёт 27-го числа каждого месяца. Вход в систему не нужен.
				</p>
			{:else}
				<div
					class="min-w-0 [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2 [&_button]:text-left [&_button]:whitespace-normal"
				>
					<Combobox
						name="userId"
						label="Учётная запись"
						placeholder="Выберите учётную запись"
						options={userOptions}
						value={String(worker?.userId ?? '')}
						hint="Связь показывает сотруднику его работы и личную зарплату."
					/>
				</div>
			{/if}
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
