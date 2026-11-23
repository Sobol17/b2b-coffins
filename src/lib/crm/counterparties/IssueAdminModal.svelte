<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input, Modal, withToast } from '$lib/ui';
	import { PLACEHOLDER } from '$lib/utils/placeholders';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let pending = $state(false);
</script>

<Modal
	bind:open
	title="Новый администратор"
	description="Скопируйте временный пароль после выдачи доступа и передайте его администратору."
>
	{#snippet body()}
		<form
			method="POST"
			action="?/adminIssue"
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (value) => (pending = value),
				success: 'Администратор выдан',
				onSuccess: () => (open = false)
			})}
		>
			<Input
				name="fullName"
				label="Имя и фамилия"
				placeholder={PLACEHOLDER.fullName}
				required
				autocomplete="off"
			/>
			<Input
				name="email"
				type="email"
				label="Электронная почта"
				placeholder={PLACEHOLDER.email}
				autocomplete="off"
			/>
			<Input name="phone" type="tel" label="Телефон" placeholder={PLACEHOLDER.phone} required />
			<Button type="submit" loading={pending} class="self-start">Сгенерировать пароль</Button>
		</form>
	{/snippet}
</Modal>
