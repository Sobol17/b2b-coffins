<script lang="ts">
	import type { SupportMessageDto } from '$lib/types/support';
	import { formatDateTime } from '$lib/utils/format';

	/** The thread oldest first, the reader's own messages on the right. */
	let { messages, timeZone }: { messages: readonly SupportMessageDto[]; timeZone: string } =
		$props();
</script>

<ol data-testid="support-messages" class="flex flex-col gap-3">
	{#each messages as message (message.id)}
		<li
			class={[
				'flex max-w-[85%] flex-col gap-1 rounded-md px-4 py-3',
				message.isMine ? 'self-end bg-surface-muted' : 'self-start border border-border'
			]}
		>
			<span class="text-sm text-fg-muted">
				{message.isMine ? 'Вы' : `${message.authorName}, ${message.authorRole}`} ·
				<time datetime={message.createdAt}>{formatDateTime(message.createdAt, timeZone)}</time>
			</span>
			<p class="break-words whitespace-pre-line">{message.body}</p>
		</li>
	{/each}
</ol>
