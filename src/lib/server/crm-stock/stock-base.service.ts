import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import type { ActorContext } from '$lib/types/actor';

/**
 * The warehouse of C8 (tech.md v1.45): `stock.read` opens the section, `stock.manage` writes to it.
 * Every write method calls `assertManage` itself: hiding a button is not a check.
 */
export abstract class StockBaseService extends BaseService {
	protected constructor(ctx: ActorContext) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'stock.read'), 'stock.read');
	}

	protected get canManage(): boolean {
		return PolicyService.can(this.ctx, 'stock.manage');
	}

	protected assertManage(): void {
		this.assert(this.canManage, 'stock.manage');
	}
}
