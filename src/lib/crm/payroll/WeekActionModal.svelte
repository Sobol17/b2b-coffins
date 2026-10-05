<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Modal, Textarea, withToast } from '$lib/ui';

	/*
	 * The three confirmations of a week (close, reopen, mark a payout) are one dialog: a hidden
	 * field naming the target, an optional comment, and the button that posts the action.
	 */
	let {
		open,
		title,
		description,
		action,
		field,
		value,
		comment,
		submitLabel,
		success,
		onClose
	}: {
		open: boolean;
		title: string;
		description: string;
		/** The form action, like `?/close`. */
		action: string;
		/** Name and value of the hidden field that says which week or line. */
		field: string;
		value: string | number;
		/** Absent: the action takes no comment. */
		comment?: { label: string; placeholder: string; required: boolean } | undefined;
		submitLabel: string;
		success: string;
		onClose: () => void;
	} = $props();

	let pending = $state(false);
</script>

<Modal {open} {title} {description} {onClose}>
	{#snippet body()}
		<form
			method="POST"
			{action}
			class="flex flex-col gap-4"
			use:enhance={withToast({
				pending: (next) => (pending = next),
				success,
				onSuccess: onClose
			})}
		>
			<input type="hidden" name={field} {value} />
			{#if comment}
				<Textarea
					name="comment"
					label={comment.label}
					placeholder={comment.placeholder}
					required={comment.required}
					rows={2}
					maxlength={500}
				/>
			{/if}
			<Button type="submit" loading={pending} class="self-start">{submitLabel}</Button>
		</form>
	{/snippet}
</Modal>
