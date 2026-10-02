import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { StockThreshold } from '../stock/stock-threshold';
import { StockDtoMapper, isManualMove } from './dto';
import { StockBaseService } from './stock-base.service';
import { StockItemRepository, type StockItemRow } from './stock-item.repository';
import { StockMoveRepository } from './stock-move.repository';
import { manualMoveProblem, reversalQty } from '$lib/domain/stock/balance';
import type { ActorContext } from '$lib/types/actor';
import type { StockMoveDto } from '$lib/types/crm-stock';
import type { ListQuery, Page } from '$lib/types/list';
import type { StockJournalFilters, StockMoveInput } from '$lib/validation/crm-stock';

/** Rows one sheet may hold. */
const EXPORT_LIMIT = 5000;

/**
 * The journal of an item and the manual moves on it (C8, tech.md v1.45): a purchase, an adjustment
 * with a reason, and the reversal that cancels either. Nothing is edited or deleted.
 */
export class StockMoveService extends StockBaseService {
	constructor(
		ctx: ActorContext,
		private readonly items: StockItemRepository = new StockItemRepository(),
		private readonly moves: StockMoveRepository = new StockMoveRepository(),
		private readonly threshold: StockThreshold = new StockThreshold(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
	}

	/** @throws NotFoundError for an unknown item. */
	journal(stockItemId: number, query: ListQuery<StockJournalFilters>): Page<StockMoveDto> {
		this.requireItem(stockItemId);
		const { rows, total } = this.moves.journal(stockItemId, query);
		return {
			rows: rows.map((row) => StockDtoMapper.toMove(row, this.canManage)),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	exportRows(stockItemId: number, query: ListQuery<StockJournalFilters>): StockMoveDto[] {
		return this.journal(stockItemId, { ...query, page: 1, perPage: EXPORT_LIMIT }).rows;
	}

	/**
	 * @throws NotFoundError for an unknown item, ConflictError for a switched-off one,
	 * ValidationError for a zero move, a purchase with a minus, an adjustment without a reason, or
	 * a colour the item is not made in.
	 */
	create(stockItemId: number, input: StockMoveInput): number {
		this.assertManage();
		return this.audited({ action: 'stock.move.create', entity: 'stock_moves' }, (tx) => {
			const item = this.requireItem(stockItemId, tx);
			if (!item.isActive) throw new ConflictError('Позиция выключена, движения по ней закрыты');
			this.checkQty(input);
			this.checkReason(input, tx);
			this.checkColour(item, input.optionId, tx);
			const id = this.moves.insert(
				{
					stockItemId,
					optionId: input.optionId,
					qty: input.qty,
					type: input.type,
					reasonId: input.reasonId,
					comment: input.comment,
					actorId: this.ctx.userId,
					occurredAt: this.now()
				},
				tx
			);
			this.threshold.watch(stockItemId, tx, this.now());
			return { result: id, entityId: id, after: { stockItemId, ...input } };
		});
	}

	/**
	 * Cancels a mistaken manual move with a row of the opposite sign (tech.md 6.3).
	 * @throws NotFoundError for a move of another item, ConflictError for a move that is not
	 * manual, is a reversal itself, or is already cancelled.
	 */
	reverse(stockItemId: number, moveId: number): number {
		this.assertManage();
		return this.audited({ action: 'stock.move.reverse', entity: 'stock_moves' }, (tx) => {
			const move = this.moves.find(moveId, tx);
			if (!move || move.stockItemId !== stockItemId) throw new NotFoundError('stock_move');
			if (!isManualMove(move.type) || move.isReversed === 1) {
				throw new ConflictError('Это движение нельзя сторнировать');
			}
			const id = this.moves.insert(
				{
					stockItemId,
					optionId: move.optionId,
					qty: reversalQty(move.qty),
					type: 'reversal',
					reversalOfId: move.id,
					actorId: this.ctx.userId,
					occurredAt: this.now()
				},
				tx
			);
			this.threshold.watch(stockItemId, tx, this.now());
			return {
				result: id,
				entityId: id,
				before: { qty: move.qty, type: move.type },
				after: { stockItemId, reversalOfId: move.id, qty: reversalQty(move.qty) }
			};
		});
	}

	private requireItem(id: number, tx?: Tx): StockItemRow {
		const item = this.items.find(id, tx);
		if (!item) throw new NotFoundError('stock_item');
		return item;
	}

	private checkQty(input: StockMoveInput): void {
		const problem = manualMoveProblem(input.type, input.qty);
		if (problem === 'zero') {
			throw new ValidationError('Количество не может быть нулём', { field: 'qty' });
		}
		if (problem === 'purchase_not_positive') {
			throw new ValidationError('Приход записывается с плюсом', { field: 'qty' });
		}
	}

	private checkReason(input: StockMoveInput, tx: Tx): void {
		if (input.reasonId === null) {
			if (input.type === 'adjustment') {
				throw new ValidationError('Выберите причину корректировки', { field: 'reasonId' });
			}
			return;
		}
		const known = this.items.dict('stock_move_reason', tx);
		if (!known.some((reason) => reason.id === input.reasonId)) {
			throw new ValidationError('Выберите причину из справочника', { field: 'reasonId' });
		}
	}

	/** A component has one colourless position; a product moves in a colour of its variants. */
	private checkColour(item: StockItemRow, optionId: number | null, tx: Tx): void {
		if (optionId === null) return;
		if (item.kind === 'component') {
			throw new ValidationError('У комплектующего нет цвета', { field: 'optionId' });
		}
		if (!this.items.colours(item.id, tx).some((colour) => colour.id === optionId)) {
			throw new ValidationError('Этого цвета нет у изделия', { field: 'optionId' });
		}
	}
}
