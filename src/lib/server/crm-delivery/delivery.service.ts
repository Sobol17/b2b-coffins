import { PolicyService } from '../auth/policy';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { PositionTitles } from '../crm-shop/dto';
import { ShopRepository } from '../crm-shop/shop.repository';
import type { Tx } from '../db/client';
import { LoadingRepository, type LoadingLineRow } from '../stock/loading.repository';
import { StockFill, type StockFillSnapshot } from '../stock/stock-fill';
import { DeliveryRepository, type StopRow } from './delivery.repository';
import { DeliveryDtoMapper } from './dto';
import { loadableQty } from '$lib/domain/request/loading';
import type { ActorContext } from '$lib/types/actor';
import {
	DELIVERY_LIST_LIMIT,
	type DeliveryDto,
	type DeliveryStopDto
} from '$lib/types/crm-delivery';
import type { DeliveryLoadInput, DeliveryUnloadInput } from '$lib/validation/crm-delivery';

/**
 * The delivery screen of C6 (tech.md v1.43): assembled requests to load and take to the door, and
 * the requests in work to plan the next trips. The loading writes stock, so it lives here.
 */
export class DeliveryService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: DeliveryRepository = new DeliveryRepository(),
		private readonly loading: LoadingRepository = new LoadingRepository(),
		private readonly fill: StockFill = new StockFill(),
		private readonly shop: ShopRepository = new ShopRepository(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'delivery.work'), 'delivery.work');
	}

	overview(): DeliveryDto {
		const snapshot = this.fill.read();
		const ready = this.repo.stops('ready', DELIVERY_LIST_LIMIT);
		const planned = this.repo.stops('in_work', DELIVERY_LIST_LIMIT);
		return {
			ready: this.project(ready, snapshot),
			readyTotal: this.repo.count('ready'),
			planned: this.project(planned, snapshot),
			plannedTotal: this.repo.count('in_work')
		};
	}

	/**
	 * Pieces of a line put on board: a shipment move off the shelf, carrying the line.
	 * @throws NotFoundError for an unknown line, ConflictError for a request that is not assembled
	 * or a shelf that does not hold the pieces, ValidationError for more than the line lacks.
	 */
	load(input: DeliveryLoadInput): void {
		this.audited({ action: 'request.load', entity: 'requests' }, (tx) => {
			const line = this.loadableLine(input.itemId, tx);
			const snapshot = this.fill.read(tx);
			const loadedQty = snapshot.lines.find((row) => row.itemId === line.itemId)?.loadedQty ?? 0;
			if (input.qty > line.qty - loadedQty) {
				throw new ValidationError('Больше, чем осталось погрузить по строке', { field: 'qty' });
			}
			const shelf = loadableQty(
				{ qty: line.qty, loadedQty },
				snapshot.filled.get(line.itemId) ?? 0
			);
			if (input.qty > shelf) {
				throw new ConflictError('На складе не хватает позиций для погрузки');
			}
			this.writeMove(line, -input.qty, null, tx);
			return { result: undefined, entityId: line.requestId, after: { ...input } };
		});
	}

	/**
	 * «Снять»: every loading of the line not yet withdrawn gets its reversal (tech.md 6.3).
	 * @throws NotFoundError, ConflictError as `load`, ValidationError for a line with nothing loaded.
	 */
	unload(input: DeliveryUnloadInput): void {
		this.audited({ action: 'request.unload', entity: 'requests' }, (tx) => {
			const line = this.loadableLine(input.itemId, tx);
			const open = this.loading.openLoadings(line.itemId, tx);
			if (open.length === 0) {
				throw new ValidationError('По строке ничего не погружено', { field: 'itemId' });
			}
			for (const move of open) this.writeMove(line, -move.qty, move.id, tx);
			const qty = -open.reduce((sum, move) => sum + move.qty, 0);
			return { result: undefined, entityId: line.requestId, after: { ...input, qty } };
		});
	}

	private project(rows: readonly StopRow[], snapshot: StockFillSnapshot): DeliveryStopDto[] {
		const ids = new Set(rows.map((row) => row.id));
		const lines = snapshot.lines
			.filter((line) => ids.has(line.requestId))
			.sort((a, b) => a.itemId - b.itemId);
		const titles = PositionTitles.read(this.shop, lines);
		const totals = this.repo.totals(
			rows.filter((row) => row.status === 'ready').map((row) => row.id)
		);
		return rows.map((row) =>
			DeliveryDtoMapper.toStop(row, {
				lines: lines.filter((line) => line.requestId === row.id),
				filled: snapshot.filled,
				titles,
				totalMinor: totals.get(row.id)
			})
		);
	}

	/** Only an assembled counterparty request is loaded: a stock request stays on the shelf. */
	private loadableLine(itemId: number, tx: Tx): LoadingLineRow & { stockItemId: number } {
		const line = this.loading.lineOf(itemId, tx);
		if (!line) throw new NotFoundError('request_item');
		const { stockItemId } = line;
		if (line.status !== 'ready' || line.isStockRequest || stockItemId === null) {
			throw new ConflictError('Погрузка доступна только у собранной заявки');
		}
		return { ...line, stockItemId };
	}

	private writeMove(
		line: LoadingLineRow & { stockItemId: number },
		qty: number,
		reversalOfId: number | null,
		tx: Tx
	): void {
		this.loading.insert(
			{
				requestId: line.requestId,
				itemId: line.itemId,
				stockItemId: line.stockItemId,
				optionId: line.optionId,
				qty,
				actorId: this.ctx.userId,
				occurredAt: this.now(),
				reversalOfId
			},
			tx
		);
	}
}
