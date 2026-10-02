import { StockBaseService } from '../crm-stock/stock-base.service';
import { StockItemRepository } from '../crm-stock/stock-item.repository';
import { StockFill } from '../stock/stock-fill';
import { BomNormRepository } from './bom-norm.repository';
import { BomVersionRepository } from './bom-version.repository';
import { productionNeeds } from '$lib/domain/stock/allocation';
import { componentNeeds, deficitMilli, deficitOrder } from '$lib/domain/stock/requirement';
import type { ActorContext } from '$lib/types/actor';
import type { BomDeficitDto, BomDeficitRowDto } from '$lib/types/crm-bom';

/**
 * What the production queue of C5 will use and what the shelf lacks for it (C9, tech.md v1.46).
 * The need is counted from the same fill the shop screen shows, so the two never disagree.
 */
export class BomDeficitService extends StockBaseService {
	constructor(
		ctx: ActorContext,
		private readonly fill: StockFill = new StockFill(),
		private readonly norms: BomNormRepository = new BomNormRepository(),
		private readonly versions: BomVersionRepository = new BomVersionRepository(),
		private readonly items: StockItemRepository = new StockItemRepository()
	) {
		super(ctx);
	}

	/** Components the queue needs, the ones in deficit first. */
	list(): BomDeficitDto {
		const snapshot = this.fill.read();
		const needs = componentNeeds(
			productionNeeds(snapshot.lines, snapshot.filled),
			this.norms.activeNorms()
		);
		const rows = [...needs].flatMap(([componentId, needMilli]): BomDeficitRowDto[] => {
			const item = this.items.find(componentId);
			if (!item) return [];
			return [
				{
					componentId,
					code: item.code,
					title: item.title,
					unitTitle: item.unitTitle,
					needMilli,
					balance: item.balance,
					deficitMilli: deficitMilli(needMilli, item.balance)
				}
			];
		});
		return {
			version: this.versions.active()?.version ?? null,
			rows: rows.sort((a, b) => deficitOrder(a, b) || a.code.localeCompare(b.code))
		};
	}
}
