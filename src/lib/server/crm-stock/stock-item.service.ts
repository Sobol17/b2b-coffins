import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { StockDtoMapper } from './dto';
import { StockBaseService } from './stock-base.service';
import { StockItemRepository, type StockItemRow } from './stock-item.repository';
import { StockRegistry } from './stock-registry';
import { StockMoveRepository } from './stock-move.repository';
import type { ActorContext } from '$lib/types/actor';
import type {
	StockCardDto,
	StockChoicesDto,
	StockFilters,
	StockRegistryRowDto
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

	list(query: ListQuery<StockFilters>): Page<StockRegistryRowDto> {
		const { rows, total } = new StockRegistry(this.items, this.moves).list(
			query,
			this.ctx.canSeeCost
		);
		return {
			rows,
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/** The registry as filtered and sorted on the screen, without paging. */
	exportRows(query: ListQuery<StockFilters>): StockRegistryRowDto[] {
		return this.list({ ...query, page: 1, perPage: EXPORT_LIMIT }).rows;
	}

	/** @throws NotFoundError for an unknown item. */
	card(id: number): StockCardDto {
		const row = this.require(id);
		return {
			...StockDtoMapper.toRow(row, this.ctx.canSeeCost),
			positions: this.moves.positions(id).map((position) => StockDtoMapper.toPosition(position)),
			colors: row.kind === 'product' ? this.items.colours(id) : [],
			isDeleted: row.deletedAt !== null,
			canManage: this.canManage && row.deletedAt === null
		};
	}

	choices(): StockChoicesDto {
		return {
			units: this.items.dict('unit'),
			reasons: this.items.dict('stock_move_reason'),
			canSeeCost: this.ctx.canSeeCost
		};
	}

	/** @throws ValidationError for a taken code or an unknown unit. */
	create(input: StockItemCreateInput): number {
		this.assertManage();
		this.assertCost(input);
		return this.audited({ action: 'stock.item.create', entity: 'stock_items' }, (tx) => {
			this.check(input, null, tx);
			const id = this.items.insert(input, tx);
			return { result: id, entityId: id, after: { ...input } };
		});
	}

	/** Updates accounting fields without changing movement history. */
	update(id: number, input: StockItemUpdateInput): void {
		this.assertManage();
		this.assertCost(input);
		this.audited({ action: 'stock.item.update', entity: 'stock_items' }, (tx) => {
			const before = this.require(id, tx);
			if (before.deletedAt) throw new ConflictError('Позиция удалена, изменения закрыты');
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
					isActive: before.isActive,
					...(input.costPriceMinor === undefined ? {} : { costPriceMinor: before.costPriceMinor })
				},
				after: { ...input }
			};
		});
	}

	/** Archive an unused zero-balance item while keeping every historical reference. */
	archive(id: number): void {
		this.assertManage();
		this.audited({ action: 'stock.item.delete', entity: 'stock_items' }, (tx) => {
			const item = this.require(id, tx);
			if (item.deletedAt) throw new ConflictError('Позиция уже удалена');
			if (this.moves.positions(id, tx).some((position) => position.balance !== 0)) {
				throw new ConflictError('Сначала обнулите остатки по всем цветам позиции');
			}
			if (this.items.hasAssignments(id, tx)) {
				throw new ConflictError(
					'Позиция используется в каталоге, заявке, производстве или черновике инвентаризации'
				);
			}
			this.items.archive(id, tx);
			return {
				result: undefined,
				entityId: id,
				before: { code: item.code },
				after: { isDeleted: true }
			};
		});
	}

	/** Only a role that sees the cost may write it (tech.md 8.1). */
	private assertCost(input: { costPriceMinor?: number | undefined }): void {
		this.assert(input.costPriceMinor === undefined || this.ctx.canSeeCost, 'stock.item.cost');
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
