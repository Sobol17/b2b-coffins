import { RegistryDtoMapper } from '../request/registry.dto';
import { RequestRegistryRepository } from '../request/request-registry.repository';
import { CounterpartyBaseService } from './counterparty-base.service';
import { CounterpartyLedgerRepository } from './counterparty-ledger.repository';
import { CrmCounterpartyRepository } from './crm-counterparty.repository';
import { CrmCounterpartyDtoMapper } from './dto';
import type { ActorContext } from '$lib/types/actor';
import type { CrmPaymentMarkDto } from '$lib/types/crm-counterparty';
import type { ListQuery, Page } from '$lib/types/list';
import type { RequestListItemDto } from '$lib/types/request';

/** Request history and payment marks of one counterparty on its workshop card (C3). */
export class CounterpartyLedgerService extends CounterpartyBaseService {
	constructor(
		ctx: ActorContext,
		counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository(),
		private readonly ledger: CounterpartyLedgerRepository = new CounterpartyLedgerRepository(),
		private readonly registry: RequestRegistryRepository = new RequestRegistryRepository()
	) {
		super(ctx, counterparties);
	}

	/** @throws NotFoundError for an unknown or removed counterparty. */
	requests(counterpartyId: number, query: ListQuery<unknown>): Page<RequestListItemDto> {
		this.requireCounterparty(counterpartyId);
		const { rows, total } = this.ledger.requests(counterpartyId, query, this.ctx.canSeePrices);
		const summaries = this.registry.summaries(rows.map((row) => row.id));
		return {
			rows: rows.map((row) => RegistryDtoMapper.toListItem(row, summaries.get(row.id))),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/**
	 * Every row of this registry is an amount, so a price-blind role gets nothing at all.
	 * @throws ForbiddenError without prices, NotFoundError for an unknown counterparty.
	 */
	payments(counterpartyId: number, query: ListQuery<unknown>): Page<CrmPaymentMarkDto> {
		this.assert(this.ctx.canSeePrices, 'counterparty.payments');
		this.requireCounterparty(counterpartyId);
		const { rows, total } = this.ledger.payments(counterpartyId, query);
		return {
			rows: rows.map(CrmCounterpartyDtoMapper.toPayment),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}
}
