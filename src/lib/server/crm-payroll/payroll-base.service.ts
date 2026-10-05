import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import type { ActorContext } from '$lib/types/actor';

/**
 * Staff and payroll of C10 (tech.md v1.48): `payroll.read` opens the section, `payroll.manage`
 * writes to it. Every write method calls `assertManage` itself: hiding a button is not a check.
 */
export abstract class PayrollBaseService extends BaseService {
	protected constructor(ctx: ActorContext) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'payroll.read'), 'payroll.read');
	}

	protected get canManage(): boolean {
		return PolicyService.can(this.ctx, 'payroll.manage');
	}

	protected assertManage(): void {
		this.assert(this.canManage, 'payroll.manage');
	}
}
