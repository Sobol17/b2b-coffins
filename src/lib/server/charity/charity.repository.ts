import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { requests } from '../db/schema';
import type {
	CharityFreeze,
	CharityFreezeSubject,
	CharityScope,
	DeliveredCharityRow
} from '$lib/domain/charity/rate';

export interface FreezeRow extends CharityFreezeSubject {
	readonly counterpartyId: number | null;
	readonly deliveredAt: Date | null;
}

/** The donation columns of `requests`. Deciding what counts toward the fund is the domain's job. */
export class CharityRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	freezeSubject(requestId: number, tx: Tx): FreezeRow | undefined {
		const [row] = this.db(tx)
			.select({
				totalMinor: requests.totalMinor,
				isStockRequest: requests.isStockRequest,
				charityAmountMinor: requests.charityAmountMinor,
				counterpartyId: requests.counterpartyId,
				deliveredAt: requests.deliveredAt
			})
			.from(requests)
			.where(eq(requests.id, requestId))
			.all();
		return row;
	}

	/** The null check in the WHERE keeps a fixed amount fixed even if two writers race. */
	freeze(requestId: number, values: CharityFreeze, tx: Tx): boolean {
		return (
			this.db(tx)
				.update(requests)
				.set(values)
				.where(and(eq(requests.id, requestId), isNull(requests.charityAmountMinor)))
				.run().changes > 0
		);
	}

	/** Requests with a frozen donation, narrowed to the counterparty when the scope names one. */
	frozenRows(scope: CharityScope, tx?: Tx): DeliveredCharityRow[] {
		return this.db(tx)
			.select({
				status: requests.status,
				isStockRequest: requests.isStockRequest,
				counterpartyId: requests.counterpartyId,
				charityAmountMinor: requests.charityAmountMinor,
				deliveredAt: requests.deliveredAt
			})
			.from(requests)
			.where(
				and(
					isNotNull(requests.charityAmountMinor),
					scope.kind === 'counterparty'
						? eq(requests.counterpartyId, scope.counterpartyId)
						: undefined
				)
			)
			.all();
	}
}
