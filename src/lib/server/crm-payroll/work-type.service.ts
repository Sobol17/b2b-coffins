import { NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { PayrollBaseService } from './payroll-base.service';
import { WorkTypeRepository } from './work-type.repository';
import type { ActorContext } from '$lib/types/actor';
import type { WorkTypeDto } from '$lib/types/crm-payroll';
import type { WorkTypeCreateInput, WorkTypeUpdateInput } from '$lib/validation/crm-payroll';

/**
 * Works and what a unit of each costs (tech.md v1.48). A day freezes the price in its entry, so
 * an edit here moves only the entries written after it.
 */
export class WorkTypeService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: WorkTypeRepository = new WorkTypeRepository()
	) {
		super(ctx);
	}

	list(): WorkTypeDto[] {
		return this.repo.all();
	}

	/** @throws ValidationError when a work with the title already exists. */
	create(input: WorkTypeCreateInput): WorkTypeDto {
		this.assertManage();
		return this.audited({ action: 'work_type.create', entity: 'work_types' }, (tx) => {
			this.assertFreeTitle(input.title, null, tx);
			const id = this.repo.insert(input, tx);
			return { result: this.require(id, tx), entityId: id, after: { ...input } };
		});
	}

	/** @throws NotFoundError for an unknown work, ValidationError for a taken title. */
	update(input: WorkTypeUpdateInput): WorkTypeDto {
		this.assertManage();
		return this.audited({ action: 'work_type.update', entity: 'work_types' }, (tx) => {
			const before = this.require(input.id, tx);
			this.assertFreeTitle(input.title, input.id, tx);
			this.repo.update(input.id, { title: input.title, rateMinor: input.rateMinor }, tx);
			return {
				result: this.require(input.id, tx),
				entityId: input.id,
				before: { title: before.title, rateMinor: before.rateMinor },
				after: { title: input.title, rateMinor: input.rateMinor }
			};
		});
	}

	/** @throws NotFoundError for an unknown work. */
	setActive(id: number, isActive: boolean): WorkTypeDto {
		this.assertManage();
		const action = isActive ? 'work_type.enable' : 'work_type.disable';
		return this.audited({ action, entity: 'work_types' }, (tx) => {
			const before = this.require(id, tx);
			this.repo.update(id, { isActive }, tx);
			return {
				result: { ...before, isActive },
				entityId: id,
				before: { isActive: before.isActive },
				after: { isActive }
			};
		});
	}

	private assertFreeTitle(title: string, exceptId: number | null, tx: Tx): void {
		if (this.repo.titleTaken(title, exceptId, tx)) {
			throw new ValidationError('Такая работа уже есть', { field: 'title' });
		}
	}

	private require(id: number, tx: Tx): WorkTypeDto {
		const row = this.repo.find(id, tx);
		if (!row) throw new NotFoundError('work type');
		return row;
	}
}
