<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ConfirmDialog, withToast } from '$lib/ui';
	let { id, title, modelId }: { id: number; title: string; modelId?: number | undefined } =
		$props();
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
	<input type="hidden" name="modelId" value={modelId ?? ''} />
	<Button type="button" variant="danger" size="sm" loading={pending} onclick={() => (open = true)}
		>Удалить</Button
	>
</form>
<ConfirmDialog
	bind:open
	title={`Удалить «${title}»?`}
	description={modelId !== undefined
		? 'Изделие со всеми размерами исчезнет из склада и каталога. История сохранится.'
		: 'Позиция исчезнет из склада и связанных списков каталога. История сохранится.'}
	confirmLabel="Удалить"
	danger
	onConfirm={() => {
		open = false;
		form?.requestSubmit();
	}}
/>
