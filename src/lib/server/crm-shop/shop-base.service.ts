import { PolicyService } from '../auth/policy';
import { ForbiddenError, NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { ShopRepository, type ShopTaskRow } from './shop.repository';
import type { ActorContext } from '$lib/types/actor';

/** The stations open to the crew and the workshop heads; each visit is fenced by its station. */
export abstract class ShopBaseService extends BaseService {
	protected constructor(
		ctx: ActorContext,
		protected readonly shop: ShopRepository = new ShopRepository()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'shop.work'), 'shop.work');
	}

	/** @throws NotFoundError for an unknown visit, ForbiddenError for one of another station. */
	protected requireTask(taskId: number, tx?: Tx): ShopTaskRow {
		const task = this.shop.task(taskId, tx);
		if (!task) throw new NotFoundError('shop task');
		if (!PolicyService.stationsOf(this.ctx).includes(task.station)) {
			throw new ForbiddenError('shop.work');
		}
		return task;
	}
}
