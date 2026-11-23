import { StockDtoMapper } from './dto';
import type { StockItemRepository, StockItemRow } from './stock-item.repository';
import type { StockMoveRepository } from './stock-move.repository';
import type {
	StockFilters,
	StockRegistryMemberDto,
	StockRegistryRowDto
} from '$lib/types/crm-stock';
import type { ListQuery } from '$lib/types/list';

/** Group first so search, threshold filters and paging never cut a model into partial balances. */
export class StockRegistry {
	constructor(
		private readonly items: StockItemRepository,
		private readonly moves: StockMoveRepository
	) {}

	list(query: ListQuery<StockFilters>, withCost: boolean) {
		const rows = [...this.groups(withCost).values()]
			.map((group) => this.summarize(group.row, group.members, withCost))
			.filter((row) => this.matches(row, query));
		const sort = query.sort === 'code' ? 'code' : 'title';
		rows.sort(
			(a, b) =>
				(a[sort].localeCompare(b[sort], 'ru') || a.id - b.id) * (query.dir === 'desc' ? -1 : 1)
		);
		const offset = (query.page - 1) * query.perPage;
		return { rows: rows.slice(offset, offset + query.perPage), total: rows.length };
	}

	private groups(withCost: boolean) {
		const links = this.items.modelLinks();
		const groups = new Map<
			string,
			{ row: StockRegistryRowDto; members: StockRegistryMemberDto[] }
		>();
		for (const item of this.items.current()) {
			const matches =
				item.kind === 'product' ? links.filter((link) => link.stockItemId === item.id) : [];
			// A shared accounting item must never be counted twice across different models.
			const model =
				new Set(matches.map((link) => link.modelId)).size === 1 ? matches[0] : undefined;
			const key = model ? `model:${model.modelId}` : `item:${item.id}`;
			const member = this.member(
				item,
				withCost,
				matches.map((link) => `${link.variantLabel} · ${link.material}`)
			);
			const group = groups.get(key);
			if (group) group.members.push(member);
			else
				groups.set(key, {
					row: {
						...member,
						modelId: model?.modelId ?? null,
						title: model?.modelTitle ?? member.title,
						code: model?.modelCode ?? member.code,
						members: []
					},
					members: [member]
				});
		}
		return groups;
	}

	private member(item: StockItemRow, withCost: boolean, labels: string[]): StockRegistryMemberDto {
		return {
			...StockDtoMapper.toRow(item, withCost),
			variantLabels: [...new Set(labels)],
			positions: this.moves.positions(item.id).map(StockDtoMapper.toPosition)
		};
	}

	private summarize(
		row: StockRegistryRowDto,
		members: StockRegistryMemberDto[],
		withCost: boolean
	): StockRegistryRowDto {
		const costs = members.map((member) => member.costPriceMinor ?? 0);
		const min = Math.min(...costs),
			max = Math.max(...costs);
		const base = { ...row };
		delete base.costPriceMinor;
		return {
			...base,
			members,
			balance: members.reduce((sum, member) => sum + member.balance, 0),
			minThreshold: members.reduce((sum, member) => sum + member.minThreshold, 0),
			isNegative: members.some((member) => member.isNegative),
			isBelowThreshold: members.some((member) => member.isBelowThreshold),
			isActive: members.some((member) => member.isActive),
			...(withCost
				? min === max
					? { costPriceMinor: min }
					: { costRange: [min, max] as const }
				: {})
		};
	}

	private matches(row: StockRegistryRowDto, query: ListQuery<StockFilters>): boolean {
		const filters = query.filters ?? {};
		if (filters.kind && row.kind !== filters.kind) return false;
		if (filters.activeOnly && !row.isActive) return false;
		if (filters.negative && !row.isNegative) return false;
		if (filters.belowThreshold && !row.isBelowThreshold) return false;
		const search = query.search?.toLocaleLowerCase('ru');
		return (
			!search ||
			[
				row.title,
				row.code,
				...row.members.flatMap((member) => [member.title, member.code, ...member.variantLabels])
			].some((text) => text.toLocaleLowerCase('ru').includes(search))
		);
	}
}
