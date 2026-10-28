import { PolicyService } from '../auth/policy';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import {
	CrmCounterpartyRepository,
	type ManagedCounterpartyRow
} from './crm-counterparty.repository';
import type { ActorContext } from '$lib/types/actor';
import type { TermsInput } from '$lib/validation/crm-counterparty';

/**
 * Shared ground of the C3 services: the workshop contour and `counterparty.manage` (owner and
 * manager) are checked once here, before any method of any C3 service can run.
 */
export abstract class CounterpartyBaseService extends BaseService {
	protected constructor(
		ctx: ActorContext,
		protected readonly counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository()
	) {
		super(ctx);
		this.assert(
			ctx.scope === 'crm' && PolicyService.can(ctx, 'counterparty.manage'),
			'counterparty.manage'
		);
	}

	/** @throws NotFoundError for an unknown or removed counterparty. */
	protected requireCounterparty(id: number, tx?: Tx): ManagedCounterpartyRow {
		const row = this.counterparties.find(id, tx);
		if (!row) throw new NotFoundError('counterparty');
		return row;
	}

	/**
	 * A region is a shared list of prices: the base list and a list of one counterparty are not.
	 * @throws ValidationError for a manager or regional list that is not there.
	 */
	protected validateTerms(
		terms: Pick<TermsInput, 'managerId' | 'regionPriceListId'>,
		tx: Tx
	): void {
		if (terms.managerId !== null && !this.counterparties.isManager(terms.managerId, tx)) {
			throw new ValidationError('Выберите администратора мастерской', { field: 'managerId' });
		}
		const region = terms.regionPriceListId;
		if (region !== null && !this.counterparties.isRegionList(region, tx)) {
			throw new ValidationError('Выберите региональный прайс-лист', {
				field: 'regionPriceListId'
			});
		}
	}
}
