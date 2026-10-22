<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import {
		Button,
		Card,
		ConfirmDialog,
		ErrorState,
		Textarea,
		TONE_CLASS,
		withToast
	} from '$lib/ui';
	import type { SupportThreadDto } from '$lib/types/support';
	import { formatDateTime } from '$lib/utils/format';
	import { supportState, type SupportContour } from './labels';
	import SupportMessageList from './SupportMessageList.svelte';

	/*
	 * One support thread with its reply form and the close button. Both write through form actions
	 * of the page, which check the fence and the status again on the server.
	 */
	let {
		thread,
		contour,
		timeZone,
		formError,
		requestHref,
		newThreadHref
	}: {
		thread: SupportThreadDto;
		contour: SupportContour;
		timeZone: string;
		formError: string | undefined;
		requestHref: ResolvedPathname | null;
		newThreadHref: ResolvedPathname | null;
	} = $props();

	let body = $state('');
	// A second tap on a slow phone must not post the same message twice and push everyone again.
	let busy = $state(false);
	let confirming = $state(false);
	let closeForm: HTMLFormElement | undefined = $state();

	const shown = $derived(supportState(thread, contour));
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-5">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
			<span
				data-testid="support-state"
				class={['inline-flex rounded-pill px-2.5 py-0.5 text-xs', TONE_CLASS[shown.tone]]}
			>
				{shown.label}
			</span>
			{#if thread.requestNumber}
				<span>
					Заявка
					{#if requestHref}
						<a class="underline" href={requestHref}>{thread.requestNumber}</a>
					{:else}
						{thread.requestNumber}
					{/if}
				</span>
			{/if}
			<span>Открыто {formatDateTime(thread.createdAt, timeZone)}, {thread.authorName}</span>
		</div>

		<SupportMessageList messages={thread.messages} {timeZone} />

		{#if formError}
			<div data-testid="support-error"><ErrorState title={formError} /></div>
		{/if}

		{#if thread.canPost}
			<form
				method="POST"
				action="?/post"
				use:enhance={withToast({
					success: 'Сообщение отправлено',
					pending: (value) => (busy = value),
					onSuccess: () => (body = '')
				})}
				class="flex flex-col gap-3 border-t border-border pt-4"
			>
				<Textarea
					name="body"
					label="Сообщение"
					placeholder="Введите сообщение"
					bind:value={body}
					rows={4}
				/>
				<div class="flex flex-wrap gap-3">
					<Button type="submit" loading={busy} data-testid="support-send">Отправить</Button>
					{#if thread.canClose}
						<Button
							type="button"
							variant="secondary"
							data-testid="support-close"
							onclick={() => (confirming = true)}
						>
							Закрыть обращение
						</Button>
					{/if}
				</div>
			</form>
			<form
				bind:this={closeForm}
				method="POST"
				action="?/close"
				use:enhance={withToast({ success: 'Обращение закрыто' })}
				hidden
			></form>
			<ConfirmDialog
				bind:open={confirming}
				title="Закрыть обращение?"
				description="Писать в него больше будет нельзя."
				confirmLabel="Закрыть"
				onConfirm={() => closeForm?.requestSubmit()}
			/>
		{:else}
			<p data-testid="support-closed" class="border-t border-border pt-4 text-fg-muted">
				Обращение закрыто
				{#if thread.closedAt}{formatDateTime(
						thread.closedAt,
						timeZone
					)}{/if}{#if thread.closedByName},
					{thread.closedByName}{/if}.
				{#if newThreadHref}
					<a class="underline" href={newThreadHref}>Новое обращение</a>
				{/if}
			</p>
		{/if}
	</Card.Content>
</Card.Root>
