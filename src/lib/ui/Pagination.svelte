<script lang="ts">
	import * as BasePagination from '$lib/ui/base/pagination/index.js';
	import type { ListQuery } from '$lib/types/list';

	let {
		total,
		query,
		onQueryChange
	}: {
		total: number;
		query: ListQuery;
		onQueryChange: (next: ListQuery) => void;
	} = $props();
</script>

{#if total > query.perPage}
	<BasePagination.Root
		count={total}
		perPage={query.perPage}
		page={query.page}
		onPageChange={(page) => onQueryChange({ ...query, page })}
	>
		{#snippet children({ pages, currentPage })}
			<BasePagination.Content data-testid="pagination">
				<BasePagination.Item>
					<BasePagination.PrevButton aria-label="Предыдущая страница" />
				</BasePagination.Item>
				{#each pages as page (page.key)}
					{#if page.type === 'ellipsis'}
						<BasePagination.Item>
							<BasePagination.Ellipsis />
						</BasePagination.Item>
					{:else}
						<BasePagination.Item>
							<BasePagination.Link {page} isActive={currentPage === page.value}>
								{page.value}
							</BasePagination.Link>
						</BasePagination.Item>
					{/if}
				{/each}
				<BasePagination.Item>
					<BasePagination.NextButton aria-label="Следующая страница" />
				</BasePagination.Item>
			</BasePagination.Content>
		{/snippet}
	</BasePagination.Root>
{/if}
