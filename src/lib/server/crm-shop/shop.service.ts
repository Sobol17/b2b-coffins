import { PolicyService } from '../auth/policy';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { ComponentConsumption } from '../stock/component-consumption';
import { StockFill } from '../stock/stock-fill';
import { StockThreshold } from '../stock/stock-threshold';
import { PositionTitles, ShopDtoMapper } from './dto';
import { ShopRepository } from './shop.repository';
import { productionNeeds } from '$lib/domain/stock/allocation';
import type { ActorContext } from '$lib/types/actor';
import { SHOP_REQUEST_LIMIT, type ShopDto } from '$lib/types/crm-shop';
import type { ShopProduceInput } from '$lib/validation/crm-shop';

/**
 * The shop floor of C5 (tech.md v1.41): what to make, the production marks and the fill of the
 * requests in work. It reads every request and writes stock, so it needs both rights.
 */
export class ShopService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly shop: ShopRepository = new ShopRepository(),
		private readonly fill: StockFill = new StockFill(),
		private readonly now: () => Date = () => new Date(),
		private readonly threshold: StockThreshold = new StockThreshold(),
		private readonly consumption: ComponentConsumption = new ComponentConsumption()
	) {
		super(ctx);
		this.assert(
			ctx.scope === 'crm' && PolicyService.can(ctx, 'request.read.any'),
			'request.read.any'
		);
		this.assert(PolicyService.can(ctx, 'stock.manage'), 'stock.manage');
	}

	/** The production queue over all requests in work and the fill of those the search shows. */
	overview(search?: string): ShopDto {
		const snapshot = this.fill.read();
		const rows = this.shop.requestsInWork(search, SHOP_REQUEST_LIMIT);
		const shown = new Set(rows.map((row) => row.id));
		const lines = snapshot.lines
			.filter((line) => shown.has(line.requestId))
			.sort((a, b) => a.itemId - b.itemId);
		const needs = productionNeeds(snapshot.lines, snapshot.filled);
		const titles = PositionTitles.read(this.shop, [...needs, ...lines]);
		return {
			queue: needs.map((need) => ShopDtoMapper.toQueueRow(need, titles, snapshot.balances)),
			requests: rows.map((row) =>
				ShopDtoMapper.toRequest(
					row,
					lines.filter((line) => line.requestId === row.id),
					snapshot.filled,
					titles
				)
			),
			requestTotal: this.shop.countInWork(search)
		};
	}

	/**
	 * Pieces made on the shop floor land on the shelf; the fill hands them to the requests. The
	 * components go off the shelf by the norm in the same transaction (tech.md v1.46).
	 * @throws NotFoundError for an unknown variant, ValidationError for a variant without a stock
	 * item or a colour outside its matrix.
	 */
	produce(input: ShopProduceInput): void {
		this.audited({ action: 'stock.produce', entity: 'stock_moves' }, (tx) => {
			const variant = this.shop.stockItemOf(input.variantId, tx);
			if (!variant) throw new NotFoundError('variant');
			if (variant.stockItemId === null) {
				throw new ValidationError('У варианта нет складской позиции, свяжите её в каталоге', {
					field: 'variantId'
				});
			}
			if (
				input.optionId !== null &&
				!this.shop.isVariantColour(input.variantId, input.optionId, tx)
			) {
				throw new ValidationError('Этого цвета нет у варианта', { field: 'optionId' });
			}
			const occurredAt = this.now();
			const moveId = this.shop.insertProduction(
				{
					stockItemId: variant.stockItemId,
					optionId: input.optionId,
					qty: input.qty,
					actorId: this.ctx.userId,
					occurredAt
				},
				tx
			);
			const used = this.consumption.write(
				{ variantId: input.variantId, pieces: input.qty, actorId: this.ctx.userId, occurredAt },
				tx
			);
			// A mark may still leave the item under its threshold: the signal is due (tech.md v1.45).
			for (const id of [variant.stockItemId, ...used.consumed.map((row) => row.componentId)]) {
				this.threshold.watch(id, tx, occurredAt);
			}
			return {
				result: undefined,
				entityId: moveId,
				after: { ...input, bomVersionId: used.bomVersionId, consumed: [...used.consumed] }
			};
		});
	}
}
