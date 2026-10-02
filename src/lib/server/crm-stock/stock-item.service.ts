import { NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { StockDtoMapper } from './dto';
import { StockBaseService } from './stock-base.service';
import { StockItemRepository, type StockItemRow } from './stock-item.repository';
import { StockMoveRepository } from './stock-move.repository';
import type { ActorContext } from '$lib/types/actor';
import type {
	StockCardDto,
	StockChoicesDto,
	StockFilters,
	StockRowDto
} from '$lib/types/crm-stock';
import type { ListQuery, Page } from '$lib/types/list';
import type { StockItemCreateInput, StockItemUpdateInput } from '$lib/validation/crm-stock';

/** Rows one sheet may hold: the registry of a workshop is far below it. */
const EXPORT_LIMIT = 5000;

/** Stock items: the registry, the card and the edits of an item (C8). */
export class StockItemService extends StockBaseService {
	constructor(
		ctx: ActorContext,
		private readonly items: StockItemRepository = new StockItemRepository(),
		private readonly moves: StockMoveRepository = new StockMoveRepository()
	) {
		super(ctx);
	}

	list(query: ListQuery<StockFilters>): Page<StockRowDto> {
		const { rows, total } = this.items.list(query);
		return {
			rows: rows.map((row) => StockDtoMapper.toRow(row)),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/** The registry as filtered and sorted on the screen, without paging. */
	exportRows(query: ListQuery<StockFilters>): StockRowDto[] {
		return this.list({ ...query, page: 1, perPage: EXPORT_LIMIT }).rows;
	}

	/** @throws NotFoundError for an unknown item. */
	card(id: number): StockCardDto {
		const row = this.require(id);
		return {
			...StockDtoMapper.toRow(row),
			positions: this.moves.positions(id).map((position) => StockDtoMapper.toPosition(position)),
			colors: row.kind === 'product' ? this.items.colours(id) : [],
			canManage: this.canManage
		};
	}

	choices(): StockChoicesDto {
		return { units: this.items.dict('unit'), reasons: this.items.dict('stock_move_reason') };
	}

	/** @throws ValidationError for a taken code or an unknown unit. */
	create(input: StockItemCreateInput): number {
		this.assertManage();
		return this.audited({ action: 'stock.item.create', entity: 'stock_items' }, (tx) => {
			this.check(input, null, tx);
			const id = this.items.insert(input, tx);
			return { result: id, entityId: id, after: { ...input } };
		});
	}

	/** The item is switched off rather than deleted: its moves keep pointing at it. */
	update(id: number, input: StockItemUpdateInput): void {
		this.assertManage();
		this.audited({ action: 'stock.item.update', entity: 'stock_items' }, (tx) => {
			const before = this.require(id, tx);
			this.check(input, id, tx);
			this.items.update(id, input, tx);
			return {
				result: undefined,
				entityId: id,
				before: {
					code: before.code,
					title: before.title,
					unitId: before.unitId,
					minThreshold: before.minThreshold,
					isActive: before.isActive
				},
				after: { ...input }
			};
		});
	}

	private require(id: number, tx?: Tx): StockItemRow {
		const row = this.items.find(id, tx);
		if (!row) throw new NotFoundError('stock_item');
		return row;
	}

	private check(input: { code: string; unitId: number }, exceptId: number | null, tx: Tx): void {
		if (this.items.codeTaken(input.code, exceptId, tx)) {
			throw new ValidationError('Позиция с таким кодом уже есть', { field: 'code' });
		}
		if (!this.items.dict('unit', tx).some((unit) => unit.id === input.unitId)) {
			throw new ValidationError('Выберите единицу из справочника', { field: 'unitId' });
		}
	}
}
