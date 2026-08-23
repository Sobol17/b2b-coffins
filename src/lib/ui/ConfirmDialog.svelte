<script lang="ts">
	import * as AlertDialog from '$lib/ui/base/alert-dialog/index.js';

	/*
	 * Used before an action that cannot be taken back. The dialog only asks: the server checks the
	 * right and the status transition again when the action arrives.
	 */
	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = 'Подтвердить',
		cancelLabel = 'Отмена',
		danger = false,
		onConfirm,
		onClose
	}: {
		open?: boolean;
		title: string;
		description?: string | undefined;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onConfirm: () => void;
		onClose?: (() => void) | undefined;
	} = $props();
</script>

<AlertDialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onClose?.();
	}}
>
	<AlertDialog.Content data-testid="confirm-dialog">
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description>{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{cancelLabel}</AlertDialog.Cancel>
			<AlertDialog.Action variant={danger ? 'danger' : 'primary'} onclick={onConfirm}>
				{confirmLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
