import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { StockBaseService } from '../crm-stock/stock-base.service';
import { BomNormRepository, type BomNormRow, type NewBomNorm } from './bom-norm.repository';
import { BomVersionRepository, type BomVersionRow } from './bom-version.repository';
import { BomDtoMapper } from './dto';
import type { ActorContext } from '$lib/types/actor';
import type { BomChoicesDto, BomNormDto, BomPageDto } from '$lib/types/crm-bom';
import type { ListQuery, Page } from '$lib/types/list';
import type { BomNormCreateInput, BomNormUpdateInput } from '$lib/validation/crm-bom';

/**
 * Versions of the component norms and their manual edits (C9, tech.md v1.46). One version is
 * active; edits go into it in place, the others are history and only read.
 */
export class BomService extends StockBaseService {
	constructor(
		ctx: ActorContext,
		private readonly versions: BomVersionRepository = new BomVersionRepository(),
		private readonly normRows: BomNormRepository = new BomNormRepository()
	) {
		super(ctx);
	}

	/** The picked version, else the active one, else the newest. */
	page(versionId?: number): BomPageDto {
		const rows = this.versions.list();
		const shown =
			rows.find((row) => row.id === versionId) ?? rows.find((row) => row.isActive) ?? rows[0];
		return {
			versions: rows.map((row) => BomDtoMapper.toVersion(row)),
			shown: shown ? BomDtoMapper.toVersion(shown) : null,
			canManage: this.canManage,
			canEdit: this.canManage && shown?.isActive === true
		};
	}

	/** @throws NotFoundError for an unknown version. */
	norms(versionId: number, query: ListQuery): Page<BomNormDto> {
		if (!this.versions.find(versionId)) throw new NotFoundError('bom_version');
		const { rows, total } = this.normRows.list(versionId, query);
		return {
			rows: rows.map((row) => BomDtoMapper.toNorm(row)),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	choices(): BomChoicesDto {
		return this.normRows.choices();
	}

	/** A new active version with the norms of the one it replaces; empty when there was none. */
	createVersion(): number {
		this.assertManage();
		return this.audited({ action: 'bom.version.create', entity: 'bom_versions' }, (tx) => {
			const previous = this.versions.active(tx);
			const created = this.versions.insertActive(
				{ importedById: this.ctx.userId, sourceFileId: null },
				tx
			);
			if (previous) this.versions.copyNorms(previous.id, created.id, tx);
			return {
				result: created.id,
				entityId: created.id,
				after: { version: created.version, copiedFromId: previous?.id ?? null }
			};
		});
	}

	/** @throws NotFoundError for an unknown version, ConflictError for the active one. */
	activate(versionId: number): void {
		this.assertManage();
		this.audited({ action: 'bom.version.activate', entity: 'bom_versions' }, (tx) => {
			const version = this.versions.find(versionId, tx);
			if (!version) throw new NotFoundError('bom_version');
			if (version.isActive) throw new ConflictError('Эта версия уже активна');
			const previous = this.versions.active(tx);
			this.versions.activate(versionId, tx);
			return {
				result: undefined,
				entityId: versionId,
				before: { activeId: previous?.id ?? null },
				after: { activeId: versionId, version: version.version }
			};
		});
	}

	/**
	 * @throws ConflictError without an active version, ValidationError for a deleted variant, an
	 * item that is not a component, or a pair the version already holds.
	 */
	createNorm(input: BomNormCreateInput): number {
		this.assertManage();
		return this.audited({ action: 'bom.norm.create', entity: 'bom_norms' }, (tx) => {
			const active = this.versions.active(tx);
			if (!active) throw new ConflictError('Сначала создайте версию норм');
			this.check(active, input, tx);
			const id = this.normRows.insert(active.id, input, tx);
			return { result: id, entityId: id, after: { bomVersionId: active.id, ...input } };
		});
	}

	/** @throws NotFoundError for an unknown norm, ConflictError for a norm of an old version. */
	updateNorm(input: BomNormUpdateInput): void {
		this.assertManage();
		this.audited({ action: 'bom.norm.update', entity: 'bom_norms' }, (tx) => {
			const norm = this.editable(input.normId, tx);
			this.normRows.setQty(norm.id, input.qtyPerUnitMilli, tx);
			return {
				result: undefined,
				entityId: norm.id,
				before: { qtyPerUnitMilli: norm.qtyPerUnitMilli },
				after: { qtyPerUnitMilli: input.qtyPerUnitMilli }
			};
		});
	}

	/** @throws NotFoundError for an unknown norm, ConflictError for a norm of an old version. */
	deleteNorm(normId: number): void {
		this.assertManage();
		this.audited({ action: 'bom.norm.delete', entity: 'bom_norms' }, (tx) => {
			const norm = this.editable(normId, tx);
			this.normRows.remove(norm.id, tx);
			return {
				result: undefined,
				entityId: norm.id,
				before: {
					bomVersionId: norm.bomVersionId,
					variantId: norm.variantId,
					componentId: norm.componentId,
					qtyPerUnitMilli: norm.qtyPerUnitMilli
				}
			};
		});
	}

	/** Old versions are history: what a past mark used must stay readable as it was. */
	private editable(normId: number, tx: Tx): BomNormRow {
		const norm = this.normRows.find(normId, tx);
		if (!norm) throw new NotFoundError('bom_norm');
		if (this.versions.active(tx)?.id !== norm.bomVersionId) {
			throw new ConflictError('Нормы правятся только в активной версии');
		}
		return norm;
	}

	private check(version: BomVersionRow, norm: NewBomNorm, tx: Tx): void {
		if (!this.normRows.isLiveVariant(norm.variantId, tx)) {
			throw new ValidationError('Выберите вариант из каталога', { field: 'variantId' });
		}
		if (!this.normRows.isComponent(norm.componentId, tx)) {
			throw new ValidationError('Выберите комплектующее со склада', { field: 'componentId' });
		}
		if (this.normRows.pairTaken(version.id, norm, tx)) {
			throw new ValidationError('Такая норма уже есть в версии', { field: 'componentId' });
		}
	}
}
