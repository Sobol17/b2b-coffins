import { PolicyService } from '../auth/policy';
import { NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import { CounterpartyRepository, type CounterpartyRow } from './counterparty.repository';
import { CounterpartyDtoMapper } from './dto';
import type { ActorContext } from '$lib/types/actor';
import type { CounterpartyCardDto, CounterpartySummaryDto } from '$lib/types/counterparty';

const STAFF_PREVIEW_SIZE = 3;

/** Read side of the counterparty for its own portal users. The workshop edits it in C3. */
export class CounterpartyService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: CounterpartyRepository = new CounterpartyRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError outside the portal, NotFoundError for a removed counterparty. */
	summary(): CounterpartySummaryDto {
		const row = this.requireOwn();
		const manager = row.managerId === null ? undefined : this.repo.findContact(row.managerId);
		return {
			name: row.name,
			manager: manager ? CounterpartyDtoMapper.toContact(manager) : null
		};
	}

	/** @throws ForbiddenError outside the portal, NotFoundError for a removed counterparty. */
	card(now: Date = new Date()): CounterpartyCardDto {
		const row = this.requireOwn();
		const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
		return CounterpartyDtoMapper.toCard(row, {
			contract: this.repo.latestContract(row.id),
			manager: row.managerId === null ? undefined : this.repo.findContact(row.managerId),
			staff: this.repo.activeStaff(row.id, STAFF_PREVIEW_SIZE),
			// Debt and purchases are money: a price-blind role never triggers the query.
			money: this.ctx.canSeePrices ? this.repo.moneyTotals(row.id, yearStart) : undefined
		});
	}

	private requireOwn(): CounterpartyRow {
		this.assert(PolicyService.can(this.ctx, 'portal.access'), 'portal.access');
		const row = this.repo.findOwn(this.ctx);
		if (!row) throw new NotFoundError('counterparty');
		return row;
	}
}
