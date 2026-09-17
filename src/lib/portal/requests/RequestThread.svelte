<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Card, FileUpload, Textarea, toast, withToast } from '$lib/ui';
	import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIMES } from '$lib/domain/request/attachments';
	import { formatDateTime } from '$lib/utils/format';
	import type { RequestAttachmentDto, RequestCommentDto } from '$lib/types/request';

	/*
	 * The thread with the manager and the files of the request. Both write through the server: the
	 * comment through a form action, the file through the files endpoint that checks the same right.
	 */
	let {
		requestId,
		comments,
		attachments,
		timeZone,
		formError
	}: {
		requestId: number;
		comments: readonly RequestCommentDto[];
		attachments: readonly RequestAttachmentDto[];
		timeZone: string;
		formError: string | undefined;
	} = $props();

	let body = $state('');

	function onUploaded(): void {
		// The row is already stored; the load function re-reads the card and the list picks it up.
		toast.success('Файл прикреплён к заявке');
		void invalidateAll();
	}
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-4">
		<h2 class="text-2xl">Переписка с менеджером</h2>

		<ul data-testid="comment-thread" class="flex flex-col gap-3">
			{#each comments as comment (comment.id)}
				<li class="flex flex-col gap-1 rounded-md bg-surface-muted px-4 py-3">
					<span class="text-sm text-fg-muted">
						{comment.isMine ? 'Вы' : comment.authorName} ·
						<time datetime={comment.createdAt}>{formatDateTime(comment.createdAt, timeZone)}</time>
					</span>
					<p>{comment.body}</p>
				</li>
			{:else}
				<li class="text-fg-muted">Сообщений пока нет.</li>
			{/each}
		</ul>

		<form
			method="POST"
			action="?/comment"
			use:enhance={withToast({
				success: {
					title: 'Сообщение отправлено',
					description: 'Менеджер ответит в этой переписке'
				},
				onSuccess: () => (body = '')
			})}
			class="flex flex-col gap-3"
		>
			<Textarea
				name="body"
				label="Сообщение менеджеру"
				placeholder="Вопрос по составу, срокам или доставке"
				bind:value={body}
				error={formError}
				rows={3}
			/>
			<Button type="submit" data-testid="post-comment" class="self-start">Отправить</Button>
		</form>

		<div class="flex flex-col gap-3 border-t border-border pt-4">
			<h3 class="text-xl">Вложения</h3>
			<ul data-testid="attachments" class="flex flex-col gap-2">
				{#each attachments as file (file.id)}
					<li>
						<a class="underline" href={resolve(`/api/files/${file.id}`)} download={file.name}>
							{file.name}
						</a>
						<span class="text-sm text-fg-muted">
							{Math.max(1, Math.round(file.sizeBytes / 1024))} КБ
						</span>
					</li>
				{:else}
					<li class="text-fg-muted">Файлов пока нет.</li>
				{/each}
			</ul>
			<FileUpload
				label="Чертёж, эскиз или скан"
				accept={ATTACHMENT_MIMES.join(',')}
				maxSizeMb={ATTACHMENT_MAX_BYTES / (1024 * 1024)}
				fields={{ requestId: String(requestId) }}
				{onUploaded}
			/>
		</div>
	</Card.Content>
</Card.Root>
