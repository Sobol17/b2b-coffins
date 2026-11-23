<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ConfirmDialog, withToast } from '$lib/ui';
	let { id, title }: { id: number; title: string } = $props();
	let open = $state(false);
	let pending = $state(false);
	let form: HTMLFormElement | undefined = $state();
</script>

<form
	method="POST"
	action="?/delete"
	bind:this={form}
	use:enhance={withToast({ success: 'Позиция удалена', pending: (value) => (pending = value) })}
>
	<input type="hidden" name="stockItemId" value={id} />
	<Button variant="danger" size="sm" loading={pending} onclick={() => (open = true)}>Удалить</Button
	>
</form>
<ConfirmDialog
	bind:open
	title={`Удалить «${title}»?`}
	description="Позиция исчезнет из реестра, история сохранится. Удаление доступно при нулевых остатках и без связей с действующим каталогом, заявками или черновиком инвентаризации."
	confirmLabel="Удалить"
	danger
	onConfirm={() => form?.requestSubmit()}
/>
