<script lang="ts">
	import Button from '$lib/ui/base/button/button.svelte';
	import { toast } from './toast.svelte';
</script>

<!-- Mounted once in the root layout; every screen pushes through toast.success / toast.error. -->
<div
	data-slot="toaster"
	class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
>
	{#each toast.items as item (item.id)}
		<div
			data-testid="toast"
			data-kind={item.kind}
			role={item.kind === 'error' ? 'alert' : 'status'}
			class={[
				'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card border px-4 py-3 text-sm shadow-overlay',
				item.kind === 'error'
					? 'border-danger/30 bg-tone-danger-soft text-tone-danger'
					: 'border-border bg-surface-raised text-fg'
			]}
		>
			<span class="flex-1">{item.message}</span>
			<Button
				variant="ghost"
				size="sm"
				aria-label="Закрыть уведомление"
				onclick={() => toast.dismiss(item.id)}
			>
				×
			</Button>
		</div>
	{/each}
</div>
