import { PolicyService } from '../auth/policy';
import { ManagedOptionRepository } from '../crm-catalog/option.repository';
import { ProductRepository } from '../crm-catalog/product.repository';
import { ManagedVariantRepository } from '../crm-catalog/variant.repository';
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

type ModelLinks = ReturnType<StockItemRepository['modelLinks']>;
interface StockArchivePlan {
	readonly models: ModelLinks;
	readonly affected: ModelLinks;
	readonly modelId: number | undefined;
	readonly checkedStockIds: number[];
	readonly stockIds: number[];
}

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
		const canManage = this.canManage && row.deletedAt === null;
		const archiveModel = canManage
			? this.singleModel(this.items.modelLinks(undefined, id))
			: undefined;
		return {
			...StockDtoMapper.toRow(row, this.ctx.canSeeCost),
			positions: this.moves.positions(id).map((position) => StockDtoMapper.toPosition(position)),
			colors: row.kind === 'product' ? this.items.colours(id) : [],
			isDeleted: row.deletedAt !== null,
			canManage,
			archiveModel: archiveModel
				? { id: archiveModel.modelId, title: archiveModel.modelTitle }
				: null
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

	/** Archives a stock position and its catalog entries without changing historical records. */
	archive(id: number, confirmedModelId?: number | null): void {
		this.assertManage();
		this.audited({ action: 'stock.item.delete', entity: 'stock_items' }, (tx) => {
			const item = this.require(id, tx);
			if (item.deletedAt) throw new ConflictError('Позиция уже удалена');
			const plan = this.archivePlan(id, tx);
			if (confirmedModelId !== undefined && confirmedModelId !== (plan.modelId ?? null)) {
				throw new ConflictError(
					'Связь с каталогом изменилась. Обновите страницу и подтвердите удаление снова.'
				);
			}
			const optionIds = this.items.linkedOptions(plan.stockIds, tx);
			if (plan.affected.length > 0 || optionIds.length > 0) {
				this.assert(PolicyService.can(this.ctx, 'catalog.manage'), 'catalog.manage');
			}
			this.assertCanArchive(plan, tx);
			const modelIds = this.archiveCatalog(plan, optionIds, tx);
			for (const stockId of plan.stockIds) this.items.archive(stockId, tx);
			return {
				result: undefined,
				entityId: id,
				before: { code: item.code },
				after: {
					isDeleted: true,
					stockIds: plan.stockIds,
					modelIds,
					variantIds: plan.affected.map((link) => link.variantId),
					optionIds
				}
			};
		});
	}

	private singleModel(links: ModelLinks) {
		const first = links[0];
		return first && links.every((link) => link.modelId === first.modelId) ? first : undefined;
	}

	private archivePlan(id: number, tx: Tx): StockArchivePlan {
		const models = this.items.modelLinks(tx);
		const linked = models.filter((link) => link.stockItemId === id);
		const modelId = this.singleModel(linked)?.modelId;
		const affected =
			modelId === undefined ? linked : models.filter((link) => link.modelId === modelId);
		const checkedStockIds = [
			id,
			...new Set(
				affected.flatMap(({ stockItemId }) =>
					stockItemId !== null &&
					stockItemId !== id &&
					this.require(stockItemId, tx).deletedAt === null
						? [stockItemId]
						: []
				)
			)
		];
		// Shared stock still belongs to other models, but its balances must not lose any colours.
		const stockIds = checkedStockIds.filter(
			(stockId) =>
				stockId === id ||
				!models.some((link) => link.stockItemId === stockId && link.modelId !== modelId)
		);
		return { models, affected, modelId, checkedStockIds, stockIds };
	}

	private archiveCatalog(plan: StockArchivePlan, optionIds: number[], tx: Tx): number[] {
		const variants = new ManagedVariantRepository();
		const models = new ProductRepository();
		const options = new ManagedOptionRepository();
		const affectedVariantIds = new Set(plan.affected.map((link) => link.variantId));
		const modelIds = new Set(plan.affected.map((link) => link.modelId));
		for (const variantId of affectedVariantIds) variants.softDelete(variantId, tx);
		for (const optionId of optionIds) options.setActive(optionId, false, tx);
		const archivedModels: number[] = [];
		for (const modelId of modelIds) {
			const remaining = plan.models.some(
				(link) => link.modelId === modelId && !affectedVariantIds.has(link.variantId)
			);
			if (!remaining) {
				models.softDeleteProduct(modelId, tx);
				archivedModels.push(modelId);
			} else if (variants.activeCount(modelId, undefined, tx) === 0) {
				models.setProductPublished(modelId, false, tx);
			}
		}
		return archivedModels;
	}

	private assertCanArchive(plan: StockArchivePlan, tx: Tx): void {
		for (const stockId of plan.checkedStockIds) {
			if (this.moves.positions(stockId, tx).some((position) => position.balance !== 0)) {
				const item = this.require(stockId, tx);
				throw new ConflictError(
					`Есть остаток по позиции «${item.title}». Сначала обнулите остатки по всем её цветам.`
				);
			}
		}
		if (this.items.hasOpenRequests(plan.stockIds, plan.modelId, tx)) {
			throw new ConflictError('Позиция используется в незавершённой заявке');
		}
		if (this.items.hasOpenProduction(plan.stockIds, plan.modelId, tx)) {
			throw new ConflictError('По позиции есть незавершённая работа в производстве');
		}
		if (this.items.hasInventoryDraft(plan.checkedStockIds, tx)) {
			throw new ConflictError('Позиция включена в черновик инвентаризации');
		}
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
