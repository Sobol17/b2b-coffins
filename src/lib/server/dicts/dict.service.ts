import { PolicyService } from '../auth/policy';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { DictRepository } from './dict.repository';
import type { ActorContext } from '$lib/types/actor';
import type { DictItemDto, DictItemFilters } from '$lib/types/crm';
import type { ListQuery, Page } from '$lib/types/list';
import type { CreateDictItemInput, UpdateDictItemInput } from '$lib/validation/dicts';

/**
 * Dictionaries of `dict_items` (C1): materials, units, work types, reasons. An item is switched off
 * rather than deleted: variants, stock items and history rows keep pointing at it.
 */
export class DictService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: DictRepository = new DictRepository()
	) {
		super(ctx);
		this.assert(
			PolicyService.can(ctx, 'settings.manage') && ctx.scope === 'crm',
			'settings.manage'
		);
	}

	list(query: ListQuery<DictItemFilters>): Page<DictItemDto> {
		const { rows, total } = this.repo.list(query);
		return { rows, total, page: query.page, perPage: query.perPage };
	}

	/** @throws ValidationError when the dictionary already holds the code. */
	create(input: CreateDictItemInput): DictItemDto {
		return this.audited({ action: 'dict.create', entity: 'dict_items' }, (tx) => {
			if (this.repo.codeTaken(input.dict, input.code, tx)) {
				throw new ValidationError('Такой код в справочнике уже есть', { field: 'code' });
			}
			const id = this.repo.insert(input, tx);
			return { result: this.require(id, tx), entityId: id, after: { ...input } };
		});
	}

	/** The code stays: fixtures, seeds and imports find the item by it. */
	update(input: UpdateDictItemInput): DictItemDto {
		return this.audited({ action: 'dict.update', entity: 'dict_items' }, (tx) => {
			const item = this.require(input.id, tx);
			this.repo.update(input.id, { title: input.title, sortOrder: input.sortOrder }, tx);
			return {
				result: this.require(input.id, tx),
				entityId: input.id,
				before: { title: item.title, sortOrder: item.sortOrder },
				after: { title: input.title, sortOrder: input.sortOrder }
			};
		});
	}

	setActive(id: number, isActive: boolean): DictItemDto {
		const action = isActive ? 'dict.enable' : 'dict.disable';
		return this.audited({ action, entity: 'dict_items' }, (tx) => {
			const item = this.require(id, tx);
			this.repo.update(id, { isActive }, tx);
			return {
				result: { ...item, isActive },
				entityId: id,
				before: { isActive: item.isActive },
				after: { isActive }
			};
		});
	}

	private require(id: number, tx: Tx): DictItemDto {
		const item = this.repo.find(id, tx);
		if (!item) throw new NotFoundError('dict item');
		return item;
	}
}
