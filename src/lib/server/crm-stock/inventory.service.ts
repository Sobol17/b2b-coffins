import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { StockFillRepository } from '../stock/stock-fill.repository';
import { StockThreshold } from '../stock/stock-threshold';
import { StockDtoMapper } from './dto';
import {
	InventoryRepository,
	type InventoryLineRow,
	type InventoryRow
} from './inventory.repository';
import { StockBaseService } from './stock-base.service';
import { StockMoveRepository } from './stock-move.repository';
import { positionKey } from '$lib/domain/stock/allocation';
import { diffCount, inventoryDelta } from '$lib/domain/stock/balance';
import type { ActorContext } from '$lib/types/actor';
import type { InventoryCardDto, InventoryRowDto } from '$lib/types/crm-stock';
import type { ListQuery, Page } from '$lib/types/list';
import type { InventoryCreateInput, InventorySaveInput } from '$lib/validation/crm-stock';

/**
 * Inventories of C8 (tech.md v1.45). A draft holds the counted figures and may be saved and
 * reopened; applying it is one transaction that reads the books again and writes a move per line
 * that differs. An applied inventory is a record: it is never edited or deleted.
 */
export class InventoryService extends StockBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: InventoryRepository = new InventoryRepository(),
		private readonly moves: StockMoveRepository = new StockMoveRepository(),
		private readonly books: StockFillRepository = new StockFillRepository(),
		private readonly threshold: StockThreshold = new StockThreshold(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
	}

	list(query: ListQuery<unknown>): Page<InventoryRowDto> {
		const { rows, total } = this.repo.list(query);
		return {
			rows: rows.map((row) => StockDtoMapper.toInventory(row)),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/** @throws NotFoundError for an unknown inventory. */
	card(id: number): InventoryCardDto {
		const row = this.require(id);
		const lines = this.repo.lines(id);
		// A draft is compared with the books as they are now, not as they were when it was opened.
		const live = row.status === 'draft' ? this.books.balances() : null;
		const shown = lines.map((line) =>
			StockDtoMapper.toLine(line, live === null ? line.expectedQty : this.onBooks(line, live))
		);
		return {
			...StockDtoMapper.toInventory(row),
			diffCount: diffCount(shown),
			lines: shown,
			canManage: this.canManage
		};
	}

	/**
	 * @throws ConflictError when a draft of the kind is already open, ValidationError when the
	 * kind has nothing to count.
	 */
	create(input: InventoryCreateInput): number {
		this.assertManage();
		return this.audited({ action: 'stock.inventory.create', entity: 'inventories' }, (tx) => {
			if (this.repo.openDraftId(input.kind, tx) !== undefined) {
				throw new ConflictError('Черновик инвентаризации этого вида уже открыт');
			}
			const positions = this.repo.countable(input.kind, tx);
			if (positions.length === 0) {
				throw new ValidationError('Считать нечего: активных позиций этого вида нет');
			}
			const id = this.repo.insert({ ...input, createdById: this.ctx.userId }, positions, tx);
			return { result: id, entityId: id, after: { ...input, lines: positions.length } };
		});
	}

	/** @throws ConflictError for an applied inventory, ValidationError for a foreign line. */
	save(id: number, input: InventorySaveInput): void {
		this.assertManage();
		this.audited({ action: 'stock.inventory.save', entity: 'inventories' }, (tx) => {
			this.write(id, input, tx);
			return { result: undefined, entityId: id, after: { lines: input.lines.length } };
		});
	}

	/**
	 * «Провести»: the counted figures are saved, the books are read again and every line that
	 * differs gets one `inventory` move, all in one transaction.
	 * @throws ConflictError for an applied inventory, ValidationError for a foreign line.
	 */
	apply(id: number, input: InventorySaveInput): void {
		this.assertManage();
		this.audited({ action: 'stock.inventory.apply', entity: 'inventories' }, (tx) => {
			const lines = this.write(id, input, tx);
			const now = this.now();
			const moved = lines.filter((line) => inventoryDelta(line) !== 0);
			for (const line of moved) {
				this.moves.insert(
					{
						stockItemId: line.stockItemId,
						optionId: line.optionId,
						qty: inventoryDelta(line),
						type: 'inventory',
						comment: `Инвентаризация № ${id}`,
						actorId: this.ctx.userId,
						occurredAt: now
					},
					tx
				);
			}
			this.repo.markApplied(id, now, tx);
			for (const stockItemId of new Set(moved.map((line) => line.stockItemId))) {
				this.threshold.watch(stockItemId, tx, now);
			}
			return {
				result: undefined,
				entityId: id,
				after: { lines: lines.length, moves: moved.length }
			};
		});
	}

	/** Only a draft goes: it has written nothing to the journal yet. */
	remove(id: number): void {
		this.assertManage();
		this.audited({ action: 'stock.inventory.delete', entity: 'inventories' }, (tx) => {
			const draft = this.requireDraft(id, tx);
			this.repo.delete(id, tx);
			return { result: undefined, entityId: id, before: { kind: draft.kind } };
		});
	}

	/** Stores the counted figures next to the books of this moment; returns the lines as stored. */
	private write(id: number, input: InventorySaveInput, tx: Tx): InventoryLineRow[] {
		this.requireDraft(id, tx);
		const lines = this.repo.lines(id, tx);
		const counted = new Map(input.lines.map((line) => [line.lineId, line.actualQty]));
		const known = new Set(lines.map((line) => line.id));
		if ([...counted.keys()].some((lineId) => !known.has(lineId))) {
			throw new ValidationError('Строка не из этой инвентаризации');
		}
		const live = this.books.balances(tx);
		const stored = lines.map((line) => ({
			...line,
			expectedQty: this.onBooks(line, live),
			actualQty: counted.get(line.id) ?? line.actualQty
		}));
		for (const line of stored) {
			this.repo.setLine(line.id, { expectedQty: line.expectedQty, actualQty: line.actualQty }, tx);
		}
		this.repo.setComment(id, input.comment, tx);
		return stored;
	}

	private onBooks(line: InventoryLineRow, live: Map<string, number>): number {
		return live.get(positionKey(line.stockItemId, line.optionId)) ?? 0;
	}

	private require(id: number, tx?: Tx): InventoryRow {
		const row = this.repo.find(id, tx);
		if (!row) throw new NotFoundError('inventory');
		return row;
	}

	private requireDraft(id: number, tx: Tx): InventoryRow {
		const row = this.require(id, tx);
		if (row.status !== 'draft') throw new ConflictError('Инвентаризация уже проведена');
		return row;
	}
}
