import type { ShopJobRow, ShopRepository, ShopTaskRow, VariantTitleRow } from './shop.repository';
import type { DemandLine } from '$lib/domain/stock/allocation';
import type {
	ShopJobDto,
	ShopPositionDto,
	ShopTaskDto,
	ShopTaskListItemDto
} from '$lib/types/crm-shop';

/** Names of the positions one screen shows, read once for the whole screen. */
export class PositionTitles {
	private readonly variants: ReadonlyMap<number, VariantTitleRow>;

	constructor(
		variants: readonly VariantTitleRow[],
		private readonly colours: ReadonlyMap<number, string>
	) {
		this.variants = new Map(variants.map((row) => [row.id, row]));
	}

	/** Reads the names of every position in the list at once: one query per kind, not per row. */
	static read(
		shop: ShopRepository,
		positions: readonly Pick<DemandLine, 'variantId' | 'optionId'>[]
	): PositionTitles {
		const variantIds = [...new Set(positions.map((row) => row.variantId))];
		const optionIds = [
			...new Set(positions.flatMap((row) => (row.optionId === null ? [] : [row.optionId])))
		];
		return new PositionTitles(shop.variantTitles(variantIds), shop.optionTitles(optionIds));
	}

	stockItemOf(variantId: number): number | null {
		return this.variants.get(variantId)?.stockItemId ?? null;
	}

	position(variantId: number, optionId: number | null): ShopPositionDto {
		const variant = this.variants.get(variantId);
		return {
			variantId,
			optionId,
			productTitle: variant?.productTitle ?? '',
			sku: variant?.sku ?? '',
			sizeCode: variant?.sizeCode ?? '',
			materialTitle: variant?.materialTitle ?? '',
			colorTitle: optionId === null ? null : (this.colours.get(optionId) ?? null)
		};
	}
}

/** «Выполнено» opens once the visit has jobs and every one is done to the piece. */
export function isVisitDone(jobs: readonly Pick<ShopJobRow, 'qty' | 'doneQty'>[]): boolean {
	return jobs.length > 0 && jobs.every((job) => job.doneQty >= job.qty);
}

/** Projection of the stations (tech.md §8). No money, counterparty, address or deceased is read. */
export class ShopDtoMapper {
	static toListItem(row: ShopTaskRow): ShopTaskListItemDto {
		return {
			id: row.id,
			requestId: row.requestId,
			number: row.number,
			station: row.station,
			priority: row.priority,
			isStockRequest: row.isStockRequest,
			deliveryAt: row.deliveryAt?.toISOString() ?? null,
			takenAt: row.takenAt?.toISOString() ?? null,
			unitCount: row.unitCount,
			doneCount: row.doneCount
		};
	}

	static toTask(
		row: ShopTaskRow,
		jobs: readonly ShopJobRow[],
		colours: ReadonlyMap<number, number>,
		titles: PositionTitles
	): ShopTaskDto {
		const open = row.completedAt === null;
		return {
			...ShopDtoMapper.toListItem(row),
			comment: row.comment,
			takenByName: row.takenByName,
			completedAt: row.completedAt?.toISOString() ?? null,
			jobs: jobs.map((job) => ShopDtoMapper.toJob(job, colours.get(job.itemId) ?? null, titles)),
			canTake: open && row.takenAt === null,
			canComplete: open && isVisitDone(jobs)
		};
	}

	private static toJob(
		job: ShopJobRow,
		optionId: number | null,
		titles: PositionTitles
	): ShopJobDto {
		return {
			...titles.position(job.variantId, optionId),
			id: job.id,
			itemId: job.itemId,
			engraving: job.engraving,
			comment: job.comment,
			qty: job.qty,
			doneQty: job.doneQty
		};
	}
}
