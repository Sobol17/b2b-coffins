<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { supportState } from '$lib/support/labels';
	import { Button, Card, FileUpload, TONE_CLASS, toast } from '$lib/ui';
	import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIMES } from '$lib/domain/request/attachments';
	import { formatDateTime } from '$lib/utils/format';
	import type { RequestAttachmentDto, RequestCommentDto } from '$lib/types/request';
	import type { SupportThreadListItemDto } from '$lib/types/support';

	/*
	 * Questions about the request and its files. Questions go to support threads since v1.57; the
	 * comments written before stay readable. The file goes through the endpoint that checks the right.
	 */
	let {
		requestId,
		comments,
		supportThreads,
		attachments,
		timeZone
	}: {
		requestId: number;
		comments: readonly RequestCommentDto[];
		supportThreads: readonly SupportThreadListItemDto[];
		attachments: readonly RequestAttachmentDto[];
		timeZone: string;
	} = $props();

	function onUploaded(): void {
		// The row is already stored; the load function re-reads the card and the list picks it up.
		toast.success('Файл прикреплён к заявке');
		void invalidateAll();
	}
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-3">
			<h2 class="text-2xl">Вопросы по заявке</h2>
			<Button
				class="sm:ml-auto"
				variant="secondary"
				href={resolve(`/portal/support/new?request=${requestId}`)}
				data-testid="ask-about-request"
			>
				Написать по заявке
			</Button>
		</div>

		<ul data-testid="request-support-threads" class="flex flex-col gap-2">
			{#each supportThreads as thread (thread.id)}
				{@const shown = supportState(thread, 'portal')}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<a class="underline" href={resolve(`/portal/support/${thread.id}`)}>
						№{thread.id}
						{thread.subject}
					</a>
					<span class={['inline-flex rounded-pill px-2.5 py-0.5 text-xs', TONE_CLASS[shown.tone]]}>
						{shown.label}
					</span>
				</li>
			{:else}
				<li class="text-fg-muted">Обращений по заявке пока нет.</li>
			{/each}
		</ul>

		{#if comments.length > 0}
			<div class="flex flex-col gap-3 border-t border-border pt-4">
				<h3 class="text-xl">Переписка с мастерской</h3>
				<ul data-testid="comment-thread" class="flex flex-col gap-3">
					{#each comments as comment (comment.id)}
						<li class="flex flex-col gap-1 rounded-md bg-surface-muted px-4 py-3">
							<span class="text-sm text-fg-muted">
								{comment.isMine ? 'Вы' : comment.authorName} ·
								<time datetime={comment.createdAt}
									>{formatDateTime(comment.createdAt, timeZone)}</time
								>
							</span>
							<p>{comment.body}</p>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

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
