<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/ui';

	/*
	 * A hidden form behind a ConfirmDialog: the dialog asks, this form posts the one id. The server
	 * checks the right and the owner of the row again when it arrives.
	 */
	let { action, id, success }: { action: string; id: number | undefined; success: string } =
		$props();

	let form = $state<HTMLFormElement>();

	export function submit(): void {
		form?.requestSubmit();
	}
</script>

<form bind:this={form} method="POST" {action} class="hidden" use:enhance={withToast({ success })}>
	<input type="hidden" name="id" value={id ?? ''} />
</form>
