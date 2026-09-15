<script lang="ts">
	let { caption }: { caption: string } = $props();

	const year = new Date().getFullYear();
</script>

<footer class="mx-auto mb-6 w-full max-w-shell px-4 sm:px-6">
	<div
		class="flex flex-wrap items-center gap-x-7 gap-y-2 rounded-card bg-surface-raised px-6 py-6 text-sm text-fg-muted sm:px-10"
	>
		<span class="font-heading text-xl font-semibold tracking-[0.14em] text-fg">АНГЕЛ</span>
		<span>{caption}</span>
		<span class="ml-auto text-fg-faint">© {year}</span>
	</div>
</footer>
